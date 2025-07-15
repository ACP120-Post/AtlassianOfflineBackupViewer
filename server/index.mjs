import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadBackups, all, get, TYPE_SQL } from './import.mjs';
import { renderContent } from './render.mjs';
import { originalContentUrl } from './original-links.mjs';
import { parse } from 'csv-parse/sync';
import { openIdentityDb, listIdentities, findIdentity, importIdentityRows, createSessionCodec,
  ensureAdminAccount, verifyAdminLogin, changeAdminPassword } from './identity.mjs';
import { assertCanRead, canRead } from './permissions.mjs';
import { SamlLogin } from './saml.mjs';
import { loadSettings, saveSettings } from './settings.mjs';
import { verifyLicence } from './licence.mjs';
import { initPlatform, productAccess, assertProduct, PRODUCTS } from './platform.mjs';
import { jiraApi } from './jira-api.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { 'backup-dir': { type: 'string' }, 'cache-dir': { type: 'string' }, port: { type: 'string', default: '3000' } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port muss zwischen 1 und 65535 liegen');
const cacheDir = path.resolve(values['cache-dir'] || path.join(rootDir, '.cache'));
const backups = await loadBackups({ rootDir, backupDir: path.resolve(values['backup-dir'] || path.join(rootDir, 'backups')),
  cacheDir, includeRoot: !values['backup-dir'],
  sites:JSON.parse(await readFile(path.join(rootDir,'backup-sites.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error;})) });

let { saml: samlConfig, licence: licenceKey } = loadSettings(rootDir);
// Berechtigungen, Identitätsimport und SSO sind lizenzpflichtig; ohne gültigen Schlüssel läuft
// der Viewer im Einzelplatz-Modus (nur der lokale Admin, dafür ohne Berechtigungsfilterung).
let licence = verifyLicence(licenceKey || process.env.LICENCE_KEY);
const licensed = () => !!licence && Date.now() <= licence.exp;
let saml = licensed() && samlConfig ? new SamlLogin(samlConfig) : null;
const applySaml = () => { saml = licensed() && samlConfig ? new SamlLogin(samlConfig) : null; };
const identityDb = openIdentityDb(cacheDir);
initPlatform(identityDb);
ensureAdminAccount(identityDb);
const sessionCodec = createSessionCodec(cacheDir);
const SESSION_COOKIE = 'cv_session';
const ADMIN_SESSION_COOKIE = 'cv_admin_session';
function parseCookies(header) {
  const jar = {};
  for (const part of (header || '').split(';')) { const i = part.indexOf('='); if (i > 0) jar[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return jar;
}
function currentIdentity(req) {
  const session = sessionCodec.decode(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  if (!session?.externalId) return null;
  const identity = findIdentity(identityDb, session.externalId);
  if (!identity || !identity.active) return null;
  return { externalId: identity.external_id, displayName: identity.display_name || identity.username || identity.external_id, email: identity.email, groups: identity.groups };
}
function setCookie(res, name, payload) {
  const value = payload ? sessionCodec.encode({ ...payload, exp: Date.now() + 12 * 60 * 60 * 1000 }) : '';
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; HttpOnly;${secure} SameSite=Lax; Path=/; ${payload ? `Max-Age=${12 * 60 * 60}` : 'Max-Age=0'}`);
}
const setSessionCookie = (res, payload) => setCookie(res, SESSION_COOKIE, payload);
const setAdminSessionCookie = (res, payload) => setCookie(res, ADMIN_SESSION_COOKIE, payload);
function currentAdmin(req) {
  const session = sessionCodec.decode(parseCookies(req.headers.cookie)[ADMIN_SESSION_COOKIE]);
  return session?.username ? { username: session.username, mustChangePassword: !!session.mustChangePassword } : null;
}
// ponytail: one users table per backup, so this just unions the (id,name) pairs not present in identities — no separate index needed for a local, occasionally-run report.
function orphanedUsers() {
  const known = new Set(all(identityDb, 'SELECT external_id FROM identities').map(r => r.external_id));
  const byId = new Map();
  for (const backup of backups.values()) {
    if (!backup.db) continue;
    for (const row of all(backup.db, 'SELECT DISTINCT id,name FROM users')) {
      if (!row.id || known.has(row.id)) continue;
      if (!byId.has(row.id)) byId.set(row.id, { id: row.id, name: row.name || '', backups: [] });
      byId.get(row.id).backups.push(backup.name);
    }
  }
  return [...byId.values()].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const statuses = new Set(['current','draft','archived','deleted','all']);
function filter(params, alias = 'c') {
  const status = params.get('status') || 'current';
  if (!statuses.has(status)) fail(400, 'Unbekannter Inhaltsstatus');
  return { sql: `${alias}.type IN (${TYPE_SQL}) AND (${alias}.id=${alias}.root_id OR ${alias}.status='draft')${status === 'all' ? '' : ` AND ${alias}.status=?`}`, args: status === 'all' ? [] : [status] };
}
function author(db, id) { return get(db, 'SELECT name FROM users WHERE id=?', id || '')?.name || id || 'Unbekannt'; }
function detail(backup, row) {
  const db = backup.db;
  const bodies = all(db, 'SELECT * FROM bodies WHERE content_id=? ORDER BY id', row.id);
  const owner = row.page_id ? get(db,'SELECT * FROM content WHERE id=?',row.page_id) : null;
  const html = renderContent(bodies.map(b => b.body).join('\n'), { db, backupId: backup.id, content: owner || row, siteUrl: backup.siteUrl });
  return { ...row, html, author: author(db, row.creator), lastAuthor: author(db, row.modifier) };
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Datei ist zu groß'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}

async function authApi(req, res, parts) {
  const admin = currentAdmin(req);
  const identity = currentIdentity(req) || (admin && !admin.mustChangePassword && !licensed()
    ? { externalId:'__admin__', displayName:'Administrator', email:'', groups:[], superuser:true } : null);
  const requireAdmin = () => { if (!admin || admin.mustChangePassword) fail(403, 'Admin-Anmeldung erforderlich'); };
  if (parts[2] === 'me') {
    return json(res, { user: identity, samlConfigured: !!saml, isAdmin: !!admin && !admin.mustChangePassword,
      products:productAccess(identityDb,identity), licence: licence && { ...licence, valid: licensed() } });
  }
  if (parts[2] === 'admin-me') return json(res, { loggedIn: !!admin, mustChangePassword: admin?.mustChangePassword || false, username: admin?.username || null });
  if (parts[2] === 'admin-login' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const result = verifyAdminLogin(identityDb, body.username || '', body.password || '');
    if (!result) fail(401, 'Benutzername oder Passwort ist falsch');
    setAdminSessionCookie(res, result);
    return json(res, result);
  }
  if (parts[2] === 'admin-logout' && req.method === 'POST') { setAdminSessionCookie(res, null); return json(res, {}); }
  if (parts[2] === 'admin-change-password' && req.method === 'POST') {
    if (!admin) fail(401, 'Admin-Anmeldung erforderlich');
    const body = JSON.parse((await readBody(req)) || '{}');
    changeAdminPassword(identityDb, body.currentPassword, body.newPassword);
    setAdminSessionCookie(res, { username: admin.username, mustChangePassword: false });
    return json(res, { ok: true });
  }
  if (parts[2] === 'orphaned-users') { requireAdmin(); return json(res, orphanedUsers()); }
  requireAdmin();
  const requireLicence = () => { if (!licensed()) fail(402, 'Für diese Funktion wird ein Lizenzschlüssel benötigt'); };
  if (parts[2] === 'licence') {
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const next = body.key ? verifyLicence(body.key) : null;
      if (body.key && !next) fail(400, 'Lizenzschlüssel ist ungültig');
      licenceKey = next ? body.key.trim() : null;
      licence = next;
      saveSettings(rootDir, { saml: samlConfig, licence: licenceKey });
      applySaml();
    }
    return json(res, licence && { ...licence, valid: licensed() });
  }
  if (parts[2] === 'products') {
    if(req.method==='POST') {
      const body=JSON.parse(await readBody(req));
      if(PRODUCTS.some(p=>typeof body[p]!=='boolean'))fail(400,'Beide Produktfreischaltungen müssen als Wahrheitswerte angegeben werden');
      identityDb.exec('BEGIN');
      try{for(const p of PRODUCTS)identityDb.prepare('UPDATE product_access SET enabled=? WHERE product=?').run(Number(body[p]),p);identityDb.exec('COMMIT');}catch(e){identityDb.exec('ROLLBACK');throw e;}
    }
    return json(res,productAccess(identityDb,null));
  }
  if(parts[2]==='product-users') {
    if(req.method==='POST') {
      requireLicence();
      const b=JSON.parse(await readBody(req));
      if(!findIdentity(identityDb,b.externalId)||!PRODUCTS.includes(b.product)||typeof b.enabled!=='boolean')fail(400,'Ungültiges Benutzer-Produktrecht');
      identityDb.prepare('INSERT INTO user_product_access VALUES(?,?,?) ON CONFLICT(external_id,product) DO UPDATE SET enabled=excluded.enabled').run(b.externalId,b.product,Number(b.enabled));
    }
    return json(res,all(identityDb,'SELECT * FROM user_product_access'));
  }
  if(parts[2]==='jira-identities') {
    if(req.method==='POST') {
      requireLicence();
      const b=JSON.parse(await readBody(req)),backup=backups.get(b.backupId);
      if(backup?.product!=='jira'||!backup.db||!get(backup.db,'SELECT id FROM users WHERE id=?',b.jiraUserKey||''))fail(400,'Jira-Nutzer oder Backup ist unbekannt');
      if(b.externalId===null)identityDb.prepare('DELETE FROM jira_identity_mappings WHERE backup_id=? AND jira_user_key=?').run(b.backupId,b.jiraUserKey);
      else{if(!findIdentity(identityDb,b.externalId))fail(400,'Zentrale Identität ist unbekannt');identityDb.prepare('INSERT INTO jira_identity_mappings VALUES(?,?,?) ON CONFLICT(backup_id,jira_user_key) DO UPDATE SET external_id=excluded.external_id').run(b.backupId,b.jiraUserKey,b.externalId);}
    }
    return json(res,{backups:[...backups.values()].filter(b=>b.product==='jira'&&b.db).map(b=>({id:b.id,name:b.name,users:all(b.db,'SELECT * FROM users ORDER BY name')})),mappings:all(identityDb,'SELECT * FROM jira_identity_mappings')});
  }
  if (parts[2] === 'users') return json(res, listIdentities(identityDb));
  if (parts[2] === 'settings') {
    if (req.method === 'GET') return json(res, { saml: samlConfig });
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (body.saml) requireLicence();
      const saved = saveSettings(rootDir, { saml: body.saml || null, licence: licenceKey });
      samlConfig = saved.saml;
      applySaml();
      return json(res, saved);
    }
  }
  if (parts[2] === 'switch' && req.method === 'POST') {
    requireLicence();
    const body = JSON.parse((await readBody(req)) || '{}');
    if (!body.externalId) { setSessionCookie(res, null); return json(res, { user: null }); }
    const target = findIdentity(identityDb, body.externalId);
    if (!target) fail(404, 'Unbekannte Identität');
    setSessionCookie(res, { externalId: target.external_id });
    return json(res, { user: { externalId: target.external_id, displayName: target.display_name || target.username || target.external_id, email: target.email, groups: target.groups } });
  }
  if (parts[2] === 'logout' && req.method === 'POST') { setSessionCookie(res, null); return json(res, { user: null }); }
  if (parts[2] === 'import-users' && req.method === 'POST') {
    requireLicence();
    const csv = await readBody(req);
    const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true });
    return json(res, importIdentityRows(identityDb, rows));
  }
  fail(404, 'Schnittstelle nicht gefunden');
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[1] === 'auth') return authApi(req, res, parts);
  if (parts[1] !== 'backups') fail(404, 'Schnittstelle nicht gefunden');
  const admin = currentAdmin(req);
  const isAdmin=!!admin&&!admin.mustChangePassword;
  // Ohne Lizenz gibt es keine Identitäten – der Admin ist der einzige Nutzer und sieht alles ungefiltert.
  const identity = currentIdentity(req) || (isAdmin && !licensed()
    ? { externalId:'__admin__', displayName:'Administrator', email:'', groups:[], superuser:true } : null);
  if (!identity && !isAdmin) fail(401, 'Anmeldung erforderlich');
  if (parts.length === 2) return json(res, [...backups.values()].filter(b=>productAccess(identityDb,identity)[b.product||'confluence']).map(b => ({ id: b.id, name: b.name, product:b.product||'confluence',features:b.report?.features,error: b.error,
    cached: b.cached, counts: b.product==='jira'&&!isAdmin?undefined:b.report?.counts, archiveDate:b.report?.archiveDate, importedAt: b.report?.importedAt, warnings: isAdmin?b.report?.warnings.length || 0:0 })));
  const backup = backups.get(parts[2]);
  if (!backup) fail(404, 'Backup nicht gefunden');
  assertProduct(identityDb,identity,backup.product||'confluence');
  if (!backup.db) fail(422, backup.error || 'Backup ist nicht lesbar');
  const db = backup.db, resource = parts[3], id = parts[4];
  if (!identity) fail(401, 'Anmeldung erforderlich');
  if(backup.product==='jira') {
    if(resource!=='jira')fail(404,'Jira-Endpunkt erforderlich');
    return jiraApi({req,res,url,parts,backup,identity,identityDb,isAdmin,json});
  }
  const readable = row => canRead(db, row, row.space_id, identity).allow;
  if (resource === 'report') return json(res, {...backup.report,cloudId:backup.cloudId,siteUrl:backup.siteUrl});
  if (resource === 'spaces') return json(res, all(db, `SELECT s.id,s.name,s.key,s.homepage,s.status,
    (SELECT count(*) FROM content c WHERE c.space_id=s.id AND c.type IN (${TYPE_SQL}) AND c.status='current' AND c.id=c.root_id) AS count
    FROM spaces s ORDER BY s.name COLLATE NOCASE`).filter(s => canRead(db, {id:s.id,root_id:s.id}, s.id, identity).allow));
  if (resource === 'tree') {
    const {sql,args} = filter(url.searchParams);
    return json(res, all(db, `SELECT c.id,c.title,c.type,c.parent_id,c.status,c.root_id,c.space_id FROM content c WHERE c.space_id=? AND ${sql} ORDER BY c.position,c.title`, url.searchParams.get('space') || '', ...args).filter(readable));
  }
  if (resource === 'search') {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length > 250) fail(400, 'Suchbegriff ist zu lang (maximal 250 Zeichen)');
    const {sql,args} = filter(url.searchParams);
    let where = sql;
    if (url.searchParams.get('space')) { where += ' AND c.space_id=?'; args.push(url.searchParams.get('space')); }
    if (url.searchParams.get('label')) { where += ' AND EXISTS(SELECT 1 FROM content_labels cl JOIN labels l ON cl.label_id=l.id WHERE cl.content_id=c.id AND l.name=?)'; args.push(url.searchParams.get('label')); }
    const tokens = q.match(/[\p{L}\p{N}_-]+/gu) || [];
    const match = tokens.map(t => `"${t}"*`).join(' AND ');
    if (q && !match) return json(res, { total: 0, items: [] });
    const offset = Math.min(100000, Math.max(0, Number(url.searchParams.get('offset')) || 0));
    const from = `FROM content c JOIN spaces s ON s.id=c.space_id ${match ? 'JOIN search ON search.content_id=c.id' : ''} WHERE ${where}${match ? ' AND search MATCH ?' : ''}`;
    if (match) args.push(match);
    const items = all(db, `SELECT c.id,c.root_id,c.title,c.type,c.status,c.space_id,c.modified,s.name AS space_name,
      ${match ? "snippet(search,2,'⟦','⟧',' … ',32)" : "''"} AS snippet ${from} ORDER BY ${match ? 'bm25(search,0,8,1)' : 'c.modified DESC'} LIMIT 50 OFFSET ?`, ...args, offset);
    const visible = items.filter(readable);
    // Filtering happens after pagination, so `total` is approximate once permissions hide rows; acceptable for a local test tool.
    return json(res, { total: visible.length, items: visible, offset });
  }
  if (resource === 'attachments') {
    const file = get(db, 'SELECT f.*,c.title,c.page_id FROM files f JOIN content c ON c.id=f.content_id WHERE f.content_id=?', id || '');
    if (!file) fail(404, 'Die Anhangdatei ist nicht im Backup enthalten');
    const owner = file.page_id ? get(db, 'SELECT id,root_id,space_id FROM content WHERE id=?', file.page_id) : null;
    if (owner && !readable(owner)) fail(404, 'Die Anhangdatei ist nicht im Backup enthalten');
    const extension = path.extname(file.title).toLowerCase();
    const safeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif':'image/avif', '.pdf': 'application/pdf' };
    const mime = safeTypes[extension] || 'application/octet-stream';
    const disposition = safeTypes[extension] && !url.searchParams.has('download') ? 'inline' : 'attachment';
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': file.size,
      'Content-Disposition': `${disposition}; filename="${file.title.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(file.title).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=3600' });
    return pipeline(await backup.archive.stream(file.entry), res);
  }
  if (resource === 'content') {
    const row = get(db, 'SELECT * FROM content WHERE id=?', id || '');
    if (!row) fail(404, 'Inhalt ist nicht in diesem Backup enthalten');
    assertCanRead(db, row, identity);
    if (parts[5] === 'raw') return json(res, {
      content: JSON.parse(row.raw), bodies: all(db, 'SELECT * FROM bodies WHERE content_id=?', id),
      properties: all(db, 'SELECT raw FROM properties WHERE content_id=?', id).map(r => JSON.parse(r.raw)),
      documents: all(db, 'SELECT * FROM documents WHERE content_id=?', id),
    });
    if (parts[5] === 'versions') return json(res, all(db, 'SELECT id,title,version,status,modified,modifier,raw FROM content WHERE root_id=? ORDER BY version DESC,modified DESC', row.root_id)
      .map(r => ({ id:r.id, title:r.title, version:r.version, status:r.status, modified:r.modified, author:author(db,r.modifier), comment:JSON.parse(r.raw).versioncomment, current:r.id===row.root_id })));
    const ancestors = [], seen = new Set([row.id]);
    let parentId = row.parent_id;
    while (parentId && !seen.has(parentId) && ancestors.length < 100) {
      seen.add(parentId);
      const parent = get(db, 'SELECT id,title,parent_id FROM content WHERE id=?', parentId);
      if (!parent) break;
      ancestors.unshift({ id:parent.id, title:parent.title }); parentId = parent.parent_id;
    }
    const comments = all(db, "SELECT * FROM content WHERE type='COMMENT' AND page_id=? AND id=root_id AND status='current' ORDER BY created", row.root_id)
      .map(c => ({ ...detail(backup,c), parentCommentId:JSON.parse(c.raw).parentcommentid || '' }));
    const attachments = all(db, "SELECT c.id,c.title,c.version,c.status,f.size,f.mime FROM content c LEFT JOIN files f ON f.content_id=c.id WHERE c.type='ATTACHMENT' AND c.page_id=? AND c.id=c.root_id ORDER BY c.title", row.root_id);
    const documents = all(db, 'SELECT kind,data FROM documents WHERE content_id=?', row.id).map(d => { try { return { kind:d.kind, data:JSON.parse(d.data) }; } catch { return { kind:d.kind, error:'Export enthält kein gültiges JSON', raw:d.data }; } });
    const space=get(db,'SELECT id,name,key FROM spaces WHERE id=?',row.space_id);
    const root=row.id===row.root_id?row:get(db,'SELECT * FROM content WHERE id=?',row.root_id);
    return json(res, { ...detail(backup,row), space, ancestors, comments, attachments, documents,
      originalUrl:originalContentUrl(backup.siteUrl,row,space,root),originalSite:backup.siteUrl||null,
      labels:all(db, 'SELECT l.name FROM labels l JOIN content_labels cl ON cl.label_id=l.id WHERE cl.content_id=? ORDER BY l.name', row.root_id).map(r=>r.name),
      children:all(db, `SELECT id,title,type FROM content WHERE parent_id=? AND id=root_id AND status='current' AND type IN (${TYPE_SQL}) ORDER BY position,title`, row.root_id),
      issues:backup.report.warnings.filter(w=>w.id===id),
    });
  }
  fail(404, 'Schnittstelle nicht gefunden');
}

const mimeTypes = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };
export const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; font-src 'self'; connect-src 'self'; object-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  try {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) fail(403,'Zugriff nur über localhost erlaubt');
    // ponytail: `npm run dev` proxies /api from Vite (5173) to this server (3000), so Origin and Host legitimately differ in dev; still block anything not on localhost/127.0.0.1.
    if (req.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)) fail(403,'Fremder Ursprung ist nicht erlaubt');
    const pathOnly = req.url.split('?')[0];
    const authRoute = req.method === 'POST' && (/^\/api\/auth\/(licence|switch|logout|import-users|settings|admin-login|admin-logout|admin-change-password|products|product-users|jira-identities)$/.test(pathOnly) || pathOnly === '/auth/saml/acs');
    if (!authRoute && !['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); fail(405,'Diese Anwendung ist ausschließlich lesend'); }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/auth/saml/login') {
      if (!saml) fail(404, 'SAML ist nicht konfiguriert');
      res.writeHead(302, { Location: await saml.loginUrl() });
      return res.end();
    }
    if (url.pathname === '/auth/saml/acs') {
      if (!saml) fail(404, 'SAML ist nicht konfiguriert');
      const form = new URLSearchParams(await readBody(req));
      const identity = await saml.validate({ SAMLResponse: form.get('SAMLResponse') });
      importIdentityRows(identityDb, [{ external_id: identity.externalId, display_name: identity.displayName, email: identity.email, groups: identity.groups.join(',') }], {replace:false});
      setSessionCookie(res, { externalId: identity.externalId });
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    if (url.pathname.startsWith('/api/')) return await api(req,res,url);
    const pathname = decodeURIComponent(url.pathname);
    const dist = path.join(rootDir,'dist');
    const isLicense = pathname === '/LICENSE';
    const filename = isLicense ? path.join(rootDir,'LICENSE') : pathname.startsWith('/assets/') ? path.resolve(dist,`.${pathname}`) : path.join(dist,'index.html');
    if (!isLicense && !filename.startsWith(`${dist}${path.sep}`)) fail(403,'Ungültiger Dateipfad');
    const info = await stat(filename).catch(()=>null);
    if (!info?.isFile()) fail(404,'Datei nicht gefunden');
    res.writeHead(200, { 'Content-Type':isLicense ? 'text/plain; charset=utf-8' : mimeTypes[path.extname(filename)] || 'application/octet-stream', 'Content-Length':info.size });
    if (req.method === 'HEAD') return res.end();
    await pipeline(createReadStream(filename),res);
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    if (!error.status) console.error(error);
    json(res, { error:error.status ? error.message : 'Inhalt konnte nicht gelesen werden. Details stehen im Serverprotokoll.' }, error.status || 500);
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Confluence-Backup-Viewer: http://localhost:${port} · ${backups.size} Backup(s) · nur lesend`));
function shutdown() { server.closeAllConnections(); server.close(); for(const b of backups.values()){ b.db?.close(); b.archive?.close(); } }
process.once('SIGINT',shutdown);
process.once('SIGTERM',shutdown);
