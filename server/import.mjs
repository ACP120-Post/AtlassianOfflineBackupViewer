import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { openArchive, archiveRows, decodeBody } from './archive.mjs';
import { plainText } from './render.mjs';
import { siteOrigin } from './original-links.mjs';
import { importJira, JIRA_FORMAT_VERSION } from './jira-import.mjs';

export const FORMAT_VERSION = 4;
export const CONTENT_TYPES = ['PAGE', 'BLOGPOST', 'FOLDER', 'DATABASE', 'WHITEBOARD', 'EMBED'];
export const TYPE_SQL = CONTENT_TYPES.map(t => `'${t}'`).join(',');
export const all = (db, sql, ...args) => db.prepare(sql).all(...args);
export const get = (db, sql, ...args) => db.prepare(sql).get(...args);

export function versionRoots(rows, warn = () => {}) {
  const byId = new Map(rows.map(row => [row.contentid, row]));
  const roots = new Map();
  for (const row of rows) {
    const seen = new Set([row.contentid]);
    let cursor = row;
    while (cursor.prevver || (cursor.draftpageid && cursor.draftpageid !== '0')) {
      const target = cursor.prevver || cursor.draftpageid;
      if (seen.has(target)) { warn(row.contentid, 'Zyklische Versionsbeziehung'); break; }
      if (!byId.has(target)) { warn(row.contentid, `Fehlende Hauptversion ${target}`); break; }
      seen.add(target);
      cursor = byId.get(target);
    }
    roots.set(row.contentid, cursor.contentid);
  }
  return roots;
}

async function fingerprint(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function importBackup(archive, target, hash) {
  const temp = `${target}.${process.pid}.tmp`;
  await rm(temp, { force: true });
  const db = new DatabaseSync(temp);
  const warnings = [];
  const warn = (id, message) => warnings.push({ id, message });
  try {
    db.exec(`
      PRAGMA journal_mode=DELETE;
      BEGIN;
      CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE spaces(id TEXT PRIMARY KEY, name TEXT, key TEXT, homepage TEXT, status TEXT, raw TEXT);
      CREATE TABLE content(id TEXT PRIMARY KEY, type TEXT, title TEXT, status TEXT, space_id TEXT, parent_id TEXT,
        page_id TEXT, root_id TEXT, version INTEGER, creator TEXT, modifier TEXT, created TEXT, modified TEXT, position INTEGER, raw TEXT);
      CREATE TABLE bodies(id TEXT PRIMARY KEY, content_id TEXT, body TEXT, type TEXT, raw TEXT);
      CREATE TABLE properties(content_id TEXT, name TEXT, value TEXT, raw TEXT);
      CREATE TABLE users(id TEXT PRIMARY KEY, name TEXT, raw TEXT);
      CREATE TABLE labels(id TEXT PRIMARY KEY, name TEXT, raw TEXT);
      CREATE TABLE content_labels(content_id TEXT, label_id TEXT, raw TEXT);
      CREATE TABLE documents(content_id TEXT, kind TEXT, data TEXT, raw TEXT);
      CREATE TABLE files(content_id TEXT PRIMARY KEY, entry TEXT, size INTEGER, mime TEXT);
      CREATE VIRTUAL TABLE search USING fts5(content_id UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2');
      CREATE TABLE content_permissions(content_id TEXT, permission_type TEXT, principal_type TEXT, principal_id TEXT, raw TEXT);
      CREATE TABLE space_permissions(space_id TEXT, perm_type TEXT, group_name TEXT, username TEXT, all_users_subject TEXT, active INTEGER, raw TEXT);
      CREATE TABLE space_role_permissions(role_id TEXT, permission_id TEXT, raw TEXT);
      CREATE TABLE space_role_assignments(role_id TEXT, space_id TEXT, principal_type TEXT, principal_id TEXT, raw TEXT);
      CREATE TABLE content_restrictions(content_id TEXT, state TEXT, raw TEXT);
      CREATE INDEX content_space ON content(space_id, status, type);
      CREATE INDEX content_parent ON content(parent_id);
      CREATE INDEX content_page ON content(page_id);
      CREATE INDEX content_root ON content(root_id);
      CREATE INDEX bodies_content ON bodies(content_id);
      CREATE INDEX properties_content ON properties(content_id, name);
      CREATE INDEX labels_content ON content_labels(content_id);
      CREATE INDEX content_permissions_content ON content_permissions(content_id);
      CREATE INDEX space_permissions_space ON space_permissions(space_id, perm_type);
      CREATE INDEX space_role_assignments_role ON space_role_assignments(role_id);
      CREATE INDEX space_role_permissions_role ON space_role_permissions(role_id);
      CREATE INDEX content_restrictions_content ON content_restrictions(content_id);
    `);
    for (const required of ['spaces', 'content', 'bodycontent']) {
      if (!archive.entries.has(`data/${required}.csv.gz`)) throw new Error(`Pflichttabelle fehlt: ${required}`);
    }
    const tables = [
      ['spaces', 'INSERT INTO spaces VALUES(?,?,?,?,?,?)', r => [r.spaceid, r.spacename, r.spacekey, r.homepage, r.spacestatus, JSON.stringify(r)]],
      ['user_mapping', 'INSERT INTO users VALUES(?,?,?)', r => [r.user_key, r.username, JSON.stringify(r)]],
      ['label', 'INSERT INTO labels VALUES(?,?,?)', r => [r.labelid, r.name, JSON.stringify(r)]],
      ['content_label', 'INSERT INTO content_labels VALUES(?,?,?)', r => [r.contentid, r.labelid, JSON.stringify(r)]],
      ['contentproperties', 'INSERT INTO properties VALUES(?,?,?,?)', r => [r.contentid, r.propertyname, r.stringval || r.longval || r.dateval || '', JSON.stringify(r)]],
      ['content_permissions', 'INSERT INTO content_permissions VALUES(?,?,?,?,?)', r => [r.content_id, r.permission_type, r.principal_type, r.principal_id, JSON.stringify(r)]],
      ['spacepermissions', 'INSERT INTO space_permissions VALUES(?,?,?,?,?,?,?)', r => [r.spaceid, r.permtype, r.permgroupname || r.externalgroupid || '', r.permusername || '', r.permalluserssubject || '', r.active === 't' ? 1 : 0, JSON.stringify(r)]],
      ['spacerole_permissions', 'INSERT INTO space_role_permissions VALUES(?,?,?)', r => [r.role_id, r.permission_id, JSON.stringify(r)]],
      ['spacerole_assignments', 'INSERT INTO space_role_assignments VALUES(?,?,?,?,?)', r => [r.role_id, r.space_id, r.principal_type, r.principal_id, JSON.stringify(r)]],
      ['content_restriction_states', 'INSERT INTO content_restrictions VALUES(?,?,?)', r => [r.content_id, r.content_restriction_state, JSON.stringify(r)]],
    ];
    // Each table is streamed; only the compact content relationships need an in-memory index.
    for (const [table, sql, values] of tables) {
      const stmt = db.prepare(sql);
      for await (const row of archiveRows(archive, `data/${table}.csv.gz`)) stmt.run(...values(row));
    }
    const rows = [];
    for await (const row of archiveRows(archive, 'data/content.csv.gz')) rows.push(row);
    const roots = versionRoots(rows, warn);
    const byId = new Map(rows.map(r => [r.contentid, r]));
    const insertContent = db.prepare('INSERT INTO content VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const row of rows) {
      const root = byId.get(roots.get(row.contentid));
      insertContent.run(row.contentid, row.contenttype, row.title, row.content_status, row.spaceid || root.spaceid,
        row.parentid || root.parentid, row.pageid || root.pageid, root.contentid, Number(row.version) || 0,
        row.creator, row.lastmodifier, row.creationdate, row.lastmoddate, Number(row.child_position) || 0, JSON.stringify(row));
    }
    const insertBody = db.prepare('INSERT INTO bodies VALUES(?,?,?,?,?)');
    for await (const row of archiveRows(archive, 'data/bodycontent.csv.gz')) {
      let body = '';
      try { body = decodeBody(row.body); } catch (error) { warn(row.contentid, `Inhalt nicht dekodierbar: ${error.message}`); }
      insertBody.run(row.bodycontentid, row.contentid, body, row.bodytypeid, JSON.stringify(row));
    }
    for (const name of archive.entries.keys()) {
      if (!/^whiteboards\/data\/[^/]+\.csv(?:\.gz)?$/.test(name)) continue;
      const insert = db.prepare('INSERT INTO documents VALUES(?,?,?,?)');
      for await (const row of archiveRows(archive, name)) {
        let data = '';
        try { data = Buffer.from(row.data || '', 'base64').toString('utf8'); JSON.parse(data); }
        catch { warn(row.contentid, 'Datenbank-/Whiteboard-Export ist kein gültiges JSON'); }
        insert.run(row.contentid, row.documenttype, data, JSON.stringify(row));
      }
    }
    const insertFile = db.prepare('INSERT INTO files VALUES(?,?,?,?)');
    for (const row of all(db, "SELECT id FROM content WHERE type='ATTACHMENT'")) {
      const props = Object.fromEntries(all(db, 'SELECT name,value FROM properties WHERE content_id=?', row.id).map(p => [p.name, p.value]));
      const entry = `attachments/${props.FILESTORE_ID}`;
      if (archive.entries.has(entry)) insertFile.run(row.id, entry, archive.entries.get(entry).uncompressedSize, props.MEDIA_TYPE || '');
      else warn(row.id, 'Anhangdatei fehlt im Archiv');
    }
    for (const row of all(db, `SELECT c.id,c.title,group_concat(b.body, char(10)) AS body FROM content c
      LEFT JOIN bodies b ON b.content_id=c.id WHERE c.type IN (${TYPE_SQL}) GROUP BY c.id`)) {
      db.prepare('INSERT INTO search VALUES(?,?,?)').run(row.id, row.title, plainText(row.body || ''));
    }
    for (const [column, table] of [['parent_id', 'content'], ['page_id', 'content'], ['space_id', 'spaces']]) {
      for (const row of all(db, `SELECT c.id,c.${column} AS target FROM content c LEFT JOIN ${table} t ON c.${column}=t.id
        WHERE c.${column}!='' AND t.id IS NULL AND c.type IN (${TYPE_SQL},'COMMENT','ATTACHMENT')`)) warn(row.id, `Fehlende Beziehung ${column}: ${row.target}`);
    }
    for (const row of all(db, 'SELECT b.content_id FROM bodies b LEFT JOIN content c ON c.id=b.content_id WHERE c.id IS NULL')) warn(row.content_id, 'Body ohne Inhaltsdatensatz');
    for (const row of all(db, "SELECT cl.content_id,cl.label_id FROM content_labels cl LEFT JOIN labels l ON cl.label_id=l.id LEFT JOIN content c ON cl.content_id=c.id WHERE cl.content_id!='' AND (l.id IS NULL OR c.id IS NULL)")) warn(row.content_id, `Label-Beziehung unvollständig: ${row.label_id}`);
    const counts = Object.fromEntries(['spaces','content','bodies','files','documents','content_permissions','space_permissions','space_role_assignments','content_restrictions'].map(t => [t, get(db, `SELECT count(*) AS n FROM ${t}`).n]));
    counts.current = get(db, `SELECT count(*) AS n FROM content WHERE type IN (${TYPE_SQL}) AND status='current' AND id=root_id`).n;
    counts.versions = get(db, `SELECT count(*) AS n FROM content WHERE type IN (${TYPE_SQL}) AND id!=root_id AND status!='draft'`).n;
    counts.emptyDatabases = all(db, "SELECT data FROM documents WHERE lower(kind)='database'").filter(r => { try { const d = JSON.parse(r.data); return !(d.entries?.length || Object.keys(d.entriesById || {}).length); } catch { return false; } }).length;
    counts.whiteboardsWithoutExport = get(db, "SELECT count(*) AS n FROM content c WHERE type='WHITEBOARD' AND NOT EXISTS(SELECT 1 FROM documents d WHERE d.content_id=c.id)").n;
    const report = { counts, warnings, importedAt: new Date().toISOString(), tables: [...archive.entries.keys()].filter(n => n.startsWith('data/')), formatVersion: FORMAT_VERSION };
    const insertMeta = db.prepare('INSERT INTO metadata VALUES(?,?)');
    insertMeta.run('fingerprint', hash);
    insertMeta.run('formatVersion', String(FORMAT_VERSION));
    insertMeta.run('report', JSON.stringify(report));
    db.exec('COMMIT; PRAGMA optimize;');
    db.close();
    await rename(temp, target);
  } catch (error) {
    db.close();
    await rm(temp, { force: true });
    throw error;
  }
}

export async function loadBackups({ backupDir, cacheDir, rootDir, includeRoot = true, sites = {} }) {
  await mkdir(cacheDir, { recursive: true });
  const paths = new Set();
  for (const directory of new Set([backupDir, ...(includeRoot ? [rootDir] : [])])) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT' && directory === backupDir) continue; throw error; }
    for (const entry of entries) if (entry.isFile() && /\.zip$/i.test(entry.name)) paths.add(path.resolve(directory, entry.name));
  }
  const backups = new Map();
  for (const filename of [...paths].sort()) {
    const id = createHash('sha256').update(filename).digest('hex').slice(0, 20);
    const backup = { id, name: path.basename(filename), filename };
    backups.set(id, backup);
    try {
      const hash = await fingerprint(filename);
      const target = path.join(cacheDir, `${id}.sqlite`);
      backup.archive = await openArchive(filename);
      backup.product = backup.archive.entries.has('entities.xml') ? 'jira' : 'confluence';
      const formatVersion = backup.product === 'jira' ? JIRA_FORMAT_VERSION : FORMAT_VERSION;
      if(backup.archive.entries.has('metadata.json')) {
        try {
          if(backup.archive.entries.get('metadata.json').uncompressedSize>1024*1024)throw new Error('Metadaten zu groß');
          const chunks=[];for await(const chunk of await backup.archive.stream('metadata.json'))chunks.push(chunk);
          const metadata=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          backup.cloudId=metadata.cloudId;
          backup.siteUrl=siteOrigin(sites[backup.name] || sites[backup.cloudId] || metadata.siteUrl || metadata.baseUrl);
        }catch(error){console.warn(`Instanz-Metadaten nicht lesbar: ${backup.name}: ${error.message}`);}
      }
      if (!backup.siteUrl) backup.siteUrl=siteOrigin(sites[backup.name]);
      let cached = false;
      try {
        const db = new DatabaseSync(target, { readOnly: true });
        try { cached = get(db, "SELECT value FROM metadata WHERE key='fingerprint'")?.value === hash
          && get(db, "SELECT value FROM metadata WHERE key='formatVersion'")?.value === String(formatVersion)
          && (get(db, "SELECT value FROM metadata WHERE key='product'")?.value || 'confluence') === backup.product; }
        finally { db.close(); }
      } catch { /* A missing or invalid cache is rebuilt atomically. */ }
      if (!cached) await (backup.product === 'jira' ? importJira : importBackup)(backup.archive, target, hash);
      backup.db = new DatabaseSync(target, { readOnly: true });
      backup.report = JSON.parse(get(backup.db, "SELECT value FROM metadata WHERE key='report'").value);
      backup.cached = cached;
      console.log(`${cached ? 'Cache' : 'Import'}: ${backup.name} · ${backup.report.counts.content ?? backup.report.counts.issues} Datensätze`);
    } catch (error) {
      backup.archive?.close();
      backup.db?.close();
      delete backup.db;
      backup.error = error.message;
      console.error(`Backup übersprungen: ${backup.name}: ${error.message}`);
    }
  }
  return backups;
}
