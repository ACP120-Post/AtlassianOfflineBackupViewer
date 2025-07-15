import { parseDocument, DomUtils } from 'htmlparser2';
import { decodeHTML } from 'entities';
import sanitizeHtml from 'sanitize-html';
import { siteOrigin } from './original-links.mjs';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const text = node => DomUtils.textContent(node);
const elements = node => (node.children || []).filter(c => c.type === 'tag');
const child = (node, name) => elements(node).find(n => n.name === name);
const attr = (node, name) => node?.attribs?.[name] || '';
function adfParam(node) {
  const values = elements(node).filter(n => n.name === 'ac:adf-parameter-value');
  if (values.length) return values.map(adfParam);
  const params = elements(node).filter(n => n.name === 'ac:adf-parameter');
  if (params.length) return Object.fromEntries(params.map(n => [attr(n, 'key'), adfParam(n)]));
  return decodeStorageText(DomUtils.textContent(node));
}
function extensionParams(node) {
  const paramsNode = elements(node).find(n => n.name === 'ac:adf-attribute' && attr(n, 'key') === 'parameters');
  return paramsNode ? adfParam(paramsNode) : {};
}
// Design-token values are stored as var(--token, #fallback); the fallback is the only part a static viewer can show.
const cssVar = value => (/var\([^,]+,\s*([^)]+)\)/.exec(value || '')?.[1] || value || '').trim();
const unavailableImage = alt => `<span class="unavailable-image">${escapeHtml(alt || 'Externes Bild ist offline nicht enthalten')}</span>`;
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function renderRoadmap(data) {
  const E = escapeHtml;
  const day = 24 * 60 * 60 * 1000;
  const start = Date.parse((data.timeline?.startDate || '').replace(' ', 'T'));
  const end = Date.parse((data.timeline?.endDate || '').replace(' ', 'T'));
  const lanes = data.lanes || [];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return `<section class="roadmap"><h3>${E(data.title || 'Roadmap')}</h3>${lanes.map(lane => `<div class="roadmap-lane"><h4 style="color:${E(lane.color?.lane || '#44546f')}">${E(lane.title || '')}</h4><ul>${(lane.bars || []).map(bar => `<li><strong>${E(bar.title || 'Ohne Titel')}</strong>${bar.description ? ` – ${E(bar.description)}` : ''}</li>`).join('')}</ul></div>`).join('') || '<p class="muted">Keine Einträge in der Roadmap.</p>'}</section>`;
  }
  const totalDays = (end - start) / day;
  const pct = ms => Math.max(0, Math.min(100, ((ms - start) / day / totalDays) * 100));
  const months = [];
  for (const cursor = new Date(start); cursor.getTime() < end; cursor.setMonth(cursor.getMonth() + 1)) {
    const monthStart = Math.max(cursor.getTime(), start);
    const monthEnd = Math.min(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime(), end);
    months.push({ label: `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`, left: pct(monthStart), width: pct(monthEnd) - pct(monthStart) });
  }
  // ponytail: duration is stored in weeks (Roadmap Planner default bar unit); adjust here if a backup surfaces a different scale.
  const bar = (b, laneColor) => {
    const barStart = Date.parse((b.startDate || '').replace(' ', 'T'));
    if (!Number.isFinite(barStart)) return '';
    const left = pct(barStart);
    const width = Math.max(0.5, Math.min(100 - left, ((b.duration || 1) * 7 / totalDays) * 100));
    return `<div class="roadmap-row"><span class="roadmap-spacer" style="width:${left}%"></span><span class="roadmap-bar" style="width:${width}%;background-color:${E(laneColor.bar || '#dfe1e6')};color:${E(laneColor.text || '#172b4d')}" title="${E(b.title || '')}${b.description ? ` – ${E(b.description)}` : ''}"><strong>${E(b.title || 'Ohne Titel')}</strong></span></div>`;
  };
  return `<section class="roadmap"><h3>${E(data.title || 'Roadmap')}</h3><div class="roadmap-chart">
    <div class="roadmap-months">${months.map(m => `<span class="roadmap-month" style="width:${m.width}%">${E(m.label)}</span>`).join('')}</div>
    <div class="roadmap-body">
      ${(data.markers || []).map(m => { const t = Date.parse((m.markerDate || '').replace(' ', 'T')); return Number.isFinite(t) && t >= start && t <= end ? `<div class="roadmap-marker" style="left:${pct(t)}%"><span class="roadmap-marker-label">${E(m.title || '')}</span></div>` : ''; }).join('')}
      ${lanes.map(lane => `<div class="roadmap-lane"><h4 class="roadmap-lane-title" style="color:${E(lane.color?.lane || '#44546f')}">${E(lane.title || '')}</h4>${Array.from(new Map((lane.bars || []).map(b => [b.rowIndex ?? 0, true])).keys()).sort((a, b2) => a - b2).map(rowIndex => `<div class="roadmap-track">${(lane.bars || []).filter(b => (b.rowIndex ?? 0) === rowIndex).map(b => bar(b, lane.color || {})).join('')}</div>`).join('')}</div>`).join('') || '<p class="muted">Keine Einträge in der Roadmap.</p>'}
    </div>
  </div></section>`;
}
const query = (db, sql, ...args) => db.prepare(sql).all(...args);
const one = (db, sql, ...args) => db.prepare(sql).get(...args);
const types = "'PAGE','BLOGPOST','FOLDER','DATABASE','WHITEBOARD','EMBED'";
const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };
export function decodeStorageText(value) {
  return decodeHTML(String(value ?? '').replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})/gi, (_, codePoint, codeUnit) => String.fromCodePoint(parseInt(codePoint || codeUnit, 16))));
}

export function plainText(html) {
  const block=/^(p|div|section|article|h[1-6]|li|tr|td|th|br|pre|blockquote|ac:.*)$/;
  const read=node=>node.type==='text'?decodeStorageText(node.data):['script','style'].includes(node.name)?'':(node.children||[]).map(read).join('')+(block.test(node.name||'')?' ':'');
  return read(parseDocument(html,{xmlMode:true})).replace(/\s+/g,' ').trim();
}
export function contentUrl(backupId, id, anchor = '') {
  return `/b/${encodeURIComponent(backupId)}/content/${encodeURIComponent(id)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}
export function attachmentUrl(backupId, id) { return `/api/backups/${encodeURIComponent(backupId)}/attachments/${encodeURIComponent(id)}`; }

function findPage(context, title, spaceKey, id) {
  const { db, content } = context;
  if (id) return one(db, 'SELECT * FROM content WHERE id=?', id);
  const space = spaceKey ? one(db, 'SELECT id FROM spaces WHERE key=? COLLATE NOCASE', spaceKey)?.id : content.space_id;
  return one(db, `SELECT * FROM content WHERE title=? COLLATE NOCASE AND space_id=? AND id=root_id AND type IN (${types}) ORDER BY status='current' DESC LIMIT 1`, title, space || '');
}

function findAttachment(context, name, pageId) {
  return one(context.db, "SELECT * FROM content WHERE type='ATTACHMENT' AND title=? AND page_id=? ORDER BY status='current' DESC, version DESC LIMIT 1", name, pageId || context.content.root_id || context.content.id);
}

export function resolveLink(value, context) {
  if (!value) return { missing: 'Leeres Linkziel' };
  if (value.startsWith('#')) return { href: value };
  if (/^(?:javascript|data|vbscript|file):/i.test(value.trim()) || value.startsWith('//')) return { missing: 'Unsicheres Linkziel entfernt' };
  let url;
  try { url = new URL(value, 'http://backup.local'); } catch { return { missing: 'Ungültiges Linkziel' }; }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return { missing: 'Nicht unterstütztes Linkziel' };
  const anchor = decode(url.hash.slice(1));
  const path = url.pathname;
  const attachment = path.match(/\/(?:download|secure)\/attachments\/([^/]+)\/([^/]+)/);
  if (attachment) {
    const file = findAttachment(context, decode(attachment[2]), attachment[1]);
    return file ? { href: attachmentUrl(context.backupId, file.id) } : { missing: `Anhang fehlt: ${decode(attachment[2])}` };
  }
  const spaceHome = path.match(/^\/(?:wiki\/)?([A-Za-z0-9_-]+)\/?$/);
  if (spaceHome && !['x', 'display', 'spaces', 'pages', 'download', 'secure'].includes(spaceHome[1])) {
    const home = one(context.db, 'SELECT homepage FROM spaces WHERE key=? COLLATE NOCASE', decode(spaceHome[1]));
    if (home?.homepage) return { href: contentUrl(context.backupId, home.homepage, anchor) };
  }
  const pagePath = path.match(/\/spaces\/([^/]+)\/(?:pages|blog|blogs)\/(\d+)(?:\/(.*))?/);
  const display = path.match(/\/display\/([^/]+)\/(.+)/);
  const tiny = path.match(/\/(?:wiki\/)?x\/([A-Za-z0-9_-]+)$/);
  let id = url.searchParams.get('pageId') || pagePath?.[2];
  if (tiny) {
    const bytes = Buffer.from(tiny[1], 'base64url');
    if (bytes.length > 0 && bytes.length <= 8) { let number = 0n; for (let i = bytes.length - 1; i >= 0; i--) number = (number << 8n) + BigInt(bytes[i]); id = String(number); }
  }
  if (id || display || tiny) {
    let page = id ? findPage(context, '', '', id) : null;
    const title = display?.[2] || pagePath?.[3];
    if (!page && title) page = findPage(context, decode(title.replace(/\+/g, ' ')), decode(display?.[1] || pagePath[1]));
    if (page) return { href: contentUrl(context.backupId, page.id, anchor) };
    const origin = context.siteUrl && siteOrigin(context.siteUrl);
    if (origin) return { href: `${origin}${path}${url.search}${url.hash}`, external: true };
    return { missing: `Seite fehlt im Backup: ${title ? decode(title.replace(/\+/g, ' ')) : id || value}` };
  }
  if (url.hostname === 'backup.local') {
    const origin = context.siteUrl && siteOrigin(context.siteUrl);
    return origin ? { href: `${origin}${path}${url.search}${url.hash}`, external: true } : { missing: `Lokales Ziel fehlt im Backup: ${value}` };
  }
  return { href: url.href, external: true };
}

// Only this explicit subset is evaluated. Unsupported CQL is shown verbatim, never approximated.
export function parseLocalCql(source) {
  let rest=source.trim();const clauses=[];
  while(rest) {
    const match=rest.match(/^(label|space|type)\s*(=|in)\s*(currentSpace\s*\(\s*\)|"[^"\\]*"|\(\s*"[^"\\]*"(?:\s*,\s*"[^"\\]*")*\s*\))\s*/i);
    if(!match)return null;
    const current=/^currentSpace/i.test(match[3]);
    if(current && (match[1].toLowerCase()!=='space'||match[2]!=='='))return null;
    if(match[2].toLowerCase()==='in'&&!match[3].startsWith('('))return null;
    if(match[2]==='='&&match[3].startsWith('('))return null;
    clauses.push({field:match[1].toLowerCase(),values:current?null:[...match[3].matchAll(/"([^"]*)"/g)].map(m=>m[1])});
    rest=rest.slice(match[0].length);
    if(!rest)break;
    if(!/^and\s+/i.test(rest))return null;
    rest=rest.replace(/^and\s+/i,'');if(!rest)return null;
  }
  return clauses.length?clauses:null;
}

export function sanitizeRendered(html) {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img','details','summary','input','figure','figcaption','colgroup','col','mark','time'],
    allowedAttributes: {
      '*': ['class','id','title','style','aria-label'], a: ['href','rel','target','title','class','id'],
      img: ['src','alt','width','height','loading'], td: ['colspan','rowspan','style'], th: ['colspan','rowspan','scope','style'],
      col: ['span','style'], ol: ['start'], input: ['type','checked','disabled','aria-label'], details: ['open'], time: ['datetime'],
    },
    allowedSchemes: ['https','http','mailto'], allowProtocolRelative: false,
    allowedStyles: { '*': {
      color: [/^#[\da-f]{3,8}$/i, /^(?:red|blue|green|yellow|purple|grey|gray|black|white)$/i],
      'background-color': [/^#[\da-f]{3,8}$/i], 'text-align': [/^(left|right|center|justify)$/],
      width: [/^\d+(?:\.\d+)?(?:px|%)$/], 'max-width': [/^\d+(?:\.\d+)?(?:px|%)$/], left: [/^\d+(?:\.\d+)?(?:px|%)$/],
    } },
    transformTags: {
      input: (_, a) => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: '', 'aria-label': 'Aufgabe', ...(Object.hasOwn(a, 'checked') ? { checked: '' } : {}) } }),
      img: (_, a) => ({ tagName: 'img', attribs: { ...a, src: /^\/api\/backups\/[a-zA-Z0-9_-]+\/attachments\/[a-zA-Z0-9_-]+$/.test(a.src || '') || /^https?:\/\//.test(a.src || '') ? a.src : '', loading: 'lazy' } }),
      a: (_, a) => ({ tagName: 'a', attribs: { ...a, rel: 'noopener noreferrer' } }),
    },
  });
}

export function renderContent(body, context) {
  const document = parseDocument(body || '', { xmlMode: true, decodeEntities: true });
  const headings = [];
  const ids = new Set();
  const headingIds = new Map();
  const collect = node => {
    if (/^h[1-6]$/.test(node.name || '')) {
      const title = decodeStorageText(text(node));
      const base = attr(node, 'id') || title.trim().replace(/\s+/g, '-') || 'Abschnitt';
      let id = base, i = 2;
      while (ids.has(id)) id = `${base}-${i++}`;
      ids.add(id); headingIds.set(node, id); headings.push({ id, title, level: Number(node.name[1]) });
    }
    for (const c of node.children || []) collect(c);
  };
  collect(document);
  const E = escapeHtml;
  const children = node => (node?.children || []).map(render).join('');
  const missing = label => `<span class="missing-target" title="Nicht im ausgewählten Backup enthalten">${E(label)}</span>`;
  const link = (target, label) => target.href ? `<a href="${E(target.href)}"${target.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>` : `${label} ${missing(target.missing)}`;
  const image = (src, alt) => { const target = resolveLink(src, context); return target.href ? `<img src="${E(target.href)}" alt="${E(alt || '')}" loading="lazy"/>` : unavailableImage(alt);};
  const list = rows => rows.length ? `<ul class="content-list">${rows.map(r => `<li><a href="${contentUrl(context.backupId, r.id)}">${E(r.title || r.type)}</a></li>`).join('')}</ul>` : '<p class="muted">Keine passenden Inhalte im Backup.</p>';
  function pageReference(node) {
    return findPage(context, attr(node, 'ri:content-title'), attr(node, 'ri:space-key'), attr(node, 'ri:content-id'));
  }
  function fileReference(node) {
    const page = child(node, 'ri:page');
    const owner = page ? pageReference(page) : null;
    if (page && !owner) return null;
    return findAttachment(context, attr(node, 'ri:filename'), owner?.root_id || owner?.id);
  }
  function macro(node) {
    const name = attr(node, 'ac:name');
    const params = Object.fromEntries(elements(node).filter(n => n.name === 'ac:parameter').map(n => [attr(n, 'ac:name'), decodeStorageText(text(n)) || (elements(n).length ? DomUtils.getInnerHTML(n) : '')]));
    const rich = child(node, 'ac:rich-text-body');
    const plain = child(node, 'ac:plain-text-body');
    const saved = () => rich ? children(rich) : plain ? `<pre>${E(decodeStorageText(text(plain)))}</pre>` : '';
    const limit = Math.min(200, Math.max(1, Number(params.max || params.maxResults || 25) || 25));
    const macroScope = params.spaceKey || params.spaces;
    const space = macroScope && !['@self','current'].includes(macroScope) ? one(context.db, 'SELECT id FROM spaces WHERE key=?', macroScope)?.id : context.content.space_id;
    if (['info','note','tip','warning','panel'].includes(name)) return `<aside class="panel panel-${name}">${params.title ? `<strong>${E(params.title)}</strong>` : ''}${saved()}</aside>`;
    if (name === 'status') return `<span class="status status-${E((params.colour || 'grey').toLowerCase())}">${E(params.title || 'Status')}</span>`;
    if (name === 'expand') return `<details class="expand"><summary>${E(params.title || 'Mehr anzeigen')}</summary>${saved()}</details>`;
    if (['code','noformat'].includes(name)) return `<figure class="code-block">${params.title || params.language ? `<figcaption>${E(params.title || params.language)}</figcaption>` : ''}<pre><code>${E(decodeStorageText(text(plain || rich || { children: [] })))}</code></pre></figure>`;
    if (name === 'anchor') return `<span id="${E(params[''] || params.name || '')}"></span>`;
    if (name === 'roadmap') {
      let data; try { data = JSON.parse(decodeURIComponent(params.source || '')); } catch { data = null; }
      if (!data) return fallback(name, params, saved(), 'Roadmap-Daten konnten nicht gelesen werden.');
      return renderRoadmap(data);
    }
    if (name === 'toc') return `<nav class="toc" aria-label="Inhaltsverzeichnis"><strong>Auf dieser Seite</strong><ul>${headings.filter(h => h.level >= Number(params.minLevel || 1) && h.level <= Number(params.maxLevel || 6)).map(h => `<li class="toc-level-${h.level}"><a href="#${E(encodeURIComponent(h.id))}">${E(h.title)}</a></li>`).join('')}</ul></nav>`;
    if (['details','excerpt'].includes(name)) return `<section class="page-properties">${saved()}</section>`;
    if (name === 'children') {
      let parent = context.content;
      if (params.page) parent = findPage(context, params.page, macroScope) || null;
      if (!parent) return missing(`Übergeordnete Seite fehlt: ${params.page}`);
      const rows = query(context.db, `SELECT * FROM content WHERE parent_id=? AND status='current' AND id=root_id AND type IN (${types}) ORDER BY position,title LIMIT ?`, parent.root_id, limit);
      return `<section class="local-macro"><h3>Unterseiten</h3>${list(rows)}</section>`;
    }
    if (['labels','listlabels'].includes(name)) {
      const labels = name === 'labels' ? query(context.db, 'SELECT l.name FROM labels l JOIN content_labels cl ON cl.label_id=l.id WHERE cl.content_id=?', context.content.root_id)
        : query(context.db, "SELECT DISTINCT l.name FROM labels l JOIN content_labels cl ON cl.label_id=l.id JOIN content c ON c.id=cl.content_id WHERE c.space_id=? AND c.status='current' AND c.id=c.root_id ORDER BY l.name", space || '');
      return `<div class="labels">${labels.map(l => `<a class="label" href="/b/${E(context.backupId)}/search?label=${encodeURIComponent(l.name)}">${E(l.name)}</a>`).join('') || '<span class="muted">Keine Labels vorhanden.</span>'}</div>`;
    }
    if (['recently-updated','recently-updated-dashboard','contentbylabel','pagetree','detailssummary','content-report-table','blog-posts'].includes(name)) {
      const label = params.label || params.labels;
      const args = [];
      let condition = "c.status='current' AND c.id=c.root_id";
      if(params.cql) {
        const clauses=parseLocalCql(params.cql);
        if(!clauses)return fallback(name,params,saved(),'Diese CQL-Abfrage wird lokal nicht unterstützt.');
        for(const clause of clauses) {
          const placeholders=clause.values?.map(()=>'?').join(',');
          if(clause.field==='label') {condition+=` AND EXISTS(SELECT 1 FROM content_labels cl JOIN labels l ON l.id=cl.label_id WHERE cl.content_id=c.id AND l.name IN (${placeholders}))`;args.push(...clause.values);}
          else if(clause.field==='space') {condition+=clause.values?` AND c.space_id IN (SELECT id FROM spaces WHERE key IN (${placeholders}))`:' AND c.space_id=?';args.push(...(clause.values||[context.content.space_id]));}
          else {condition+=` AND c.type IN (${placeholders})`;args.push(...clause.values.map(v=>v.toUpperCase()));}
        }
      } else {
        condition+=' AND c.space_id=?';args.push(space||'');
        if (label) { const labels = label.split(/[,\s]+/).filter(Boolean); condition += ` AND EXISTS(SELECT 1 FROM content_labels cl JOIN labels l ON l.id=cl.label_id WHERE cl.content_id=c.id AND l.name IN (${labels.map(() => '?').join(',')}))`; args.push(...labels); }
      }
      if(name==='blog-posts')condition+=" AND c.type='BLOGPOST'";
      const recent=name.startsWith('recently-updated')||name==='blog-posts'||params.sort==='modified';
      const rows = query(context.db, `SELECT c.* FROM content c WHERE ${condition} AND c.type IN (${types}) ORDER BY ${recent ? 'modified DESC' : 'title'} LIMIT ?`, ...args, limit);
      if (name === 'detailssummary') {
        const properties = rows.map(row => {
          const body = one(context.db, 'SELECT body FROM bodies WHERE content_id=? LIMIT 1', row.id)?.body || '';
          const doc = parseDocument(body, { xmlMode: true });
          const detail = DomUtils.findOne(n => n.name === 'ac:structured-macro' && attr(n, 'ac:name') === 'details', doc.children, true);
          return detail ? { row, detail } : null;
        }).filter(Boolean);
        return `<section class="local-macro"><h3>Seitenbericht</h3>${properties.map(({row,detail}) => `<h4><a href="${contentUrl(context.backupId,row.id)}">${E(row.title)}</a></h4>${context.depth ? '<p>Verschachtelter Bericht: siehe verlinkte Seite.</p>' : renderContent(DomUtils.getOuterHTML(detail), { ...context, content: row, depth: 1 })}`).join('') || '<p>Keine gespeicherten Seiteneigenschaften gefunden.</p>'}</section>`;
      }
      if(name==='content-report-table')return `<section class="local-macro"><h3>Seitenbericht</h3><table><thead><tr><th>Seite</th><th>Zuletzt geändert</th></tr></thead><tbody>${rows.map(row=>`<tr><td><a href="${contentUrl(context.backupId,row.id)}">${E(row.title)}</a></td><td>${E(row.modified)}</td></tr>`).join('')}</tbody></table>${!rows.length?'<p>Keine passenden Inhalte im Backup.</p>':''}</section>`;
      return `<section class="local-macro"><h3>${name.startsWith('recently-updated') ? 'Zuletzt geändert' : name === 'contentbylabel' ? 'Inhalte mit Label' : name==='blog-posts'?'Blogposts':'Seiten im Bereich'}</h3>${list(rows)}</section>`;
    }
    if(['livesearch','pagetreesearch'].includes(name))return `<p class="local-macro"><a href="/b/${E(context.backupId)}/search?space=${encodeURIComponent(context.content.space_id)}">${E(params.placeholder || 'Diesen Bereich durchsuchen')} →</a></p>`;
    if(name==='view-file') {
      const reference=DomUtils.findOne(n=>n.name==='ri:attachment',node.children||[],true);
      const file=reference?fileReference(reference):findAttachment(context,params.name||'');
      return file?link({href:attachmentUrl(context.backupId,file.id)},E(`Datei öffnen: ${file.title}`)):fallback(name,params,saved(),'Anhang nicht im Backup gefunden.');
    }
    if (['include','excerpt-include'].includes(name)) {
      const reference = DomUtils.findOne(n => n.name === 'ri:page', node.children || [], true);
      const page = reference ? pageReference(reference) : findPage(context, params[''] || params.page, macroScope);
      if (!page) return fallback(name, params, saved(), 'Eingebundene Seite fehlt im Backup.');
      if ((context.visited || []).includes(page.id) || (context.depth || 0) >= 4 || page.id === context.content.id) return link({ href: contentUrl(context.backupId, page.id) }, E(`Einbindung: ${page.title} (verschachtelt)`));
      let body = one(context.db, 'SELECT body FROM bodies WHERE content_id=? LIMIT 1', page.id)?.body || '';
      if (name === 'excerpt-include') {
        const doc = parseDocument(body, { xmlMode: true });
        const excerpt = DomUtils.findOne(n => n.name === 'ac:structured-macro' && attr(n, 'ac:name') === 'excerpt', doc.children, true);
        if (!excerpt) return fallback(name, params, '', 'Kein gespeicherter Auszug vorhanden.');
        body = DomUtils.getOuterHTML(excerpt);
      }
      return renderContent(body, { ...context, content: page, visited: [...(context.visited || []), context.content.id], depth: (context.depth || 0) + 1 });
    }
    if (name === 'attachments') return list(query(context.db, "SELECT * FROM content WHERE type='ATTACHMENT' AND page_id=? AND id=root_id ORDER BY title", context.content.root_id).map(r => ({...r, type:'Anhang'}))).replaceAll(`/b/${context.backupId}/content/`, `/api/backups/${context.backupId}/attachments/`);
    if (['profile','profile-picture'].includes(name)) {
      const user = params.user || params.User;
      return `<span class="author">${E(one(context.db, 'SELECT name FROM users WHERE id=?', user || '')?.name || user || 'Autor im Backup nicht angegeben')}</span>`;
    }
    return fallback(name || 'Unbekanntes Makro', params, saved(), 'Makro wird ohne Live-Daten angezeigt.');
  }
  function fallback(name, params, saved, note) {
    return `<section class="macro-fallback"><div class="macro-heading">${E(name)} <span>Gespeichertes Makro</span></div><p class="muted">${E(note)}</p>${Object.keys(params).length ? `<details><summary>Parameter</summary><dl>${Object.entries(params).map(([k,v]) => `<dt>${E(k || 'Wert')}</dt><dd>${E(v)}</dd>`).join('')}</dl></details>` : ''}${saved || '<p class="muted">Kein gespeicherter Inhalt vorhanden.</p>'}</section>`;
  }
  function render(node) {
    if (node.type === 'text') return E(decodeStorageText(node.data));
    if (node.type === 'cdata') return E(text(node));
    if (node.type !== 'tag') return '';
    const name = node.name;
    if (name === 'ac:structured-macro' || name === 'ac:macro') return macro(node);
    if (name === 'ac:layout') return `<div class="confluence-layout">${children(node)}</div>`;
    if (name === 'ac:layout-section') return `<section class="layout-section layout-${E(attr(node,'ac:type'))}">${children(node)}</section>`;
    if (name === 'ac:layout-cell') return `<div class="layout-cell">${children(node)}</div>`;
    if (name === 'ac:link') {
      const page = child(node, 'ri:page') || child(node, 'ri:blog-post');
      const file = child(node, 'ri:attachment');
      const user = child(node, 'ri:user');
      if (user) return render(user);
      const anchor = attr(node, 'ac:anchor');
      const labelNode = child(node, 'ac:link-body') || child(node, 'ac:plain-text-link-body');
      const label = labelNode ? children(labelNode) : E(attr(page, 'ri:content-title') || attr(file, 'ri:filename') || anchor || 'Link');
      const target = page ? pageReference(page) : file ? fileReference(file) : null;
      return link(target ? { href: file ? attachmentUrl(context.backupId,target.id) : contentUrl(context.backupId,target.id,anchor) } : !page && !file && anchor ? { href: `#${encodeURIComponent(anchor)}` } : { missing: 'Ziel fehlt im Backup' }, label);
    }
    if (name === 'ac:image') {
      const fileNode = child(node, 'ri:attachment');
      const file = fileNode && fileReference(fileNode);
      const alt = attr(node, 'ac:alt') || attr(fileNode,'ri:filename') || 'Bild';
      if (file && one(context.db, 'SELECT entry FROM files WHERE content_id=?', file.id)) return `<img src="${attachmentUrl(context.backupId,file.id)}" alt="${E(alt)}" width="${E(attr(node,'ac:width'))}"/>`;
      const remote = child(node, 'ri:url');
      if (remote) return image(attr(remote, 'ri:value'), alt);
      return `<span class="unavailable-image">${missing(`Bilddatei fehlt: ${alt}`)}</span>`;
    }
    if (name === 'ri:user') {
      const id = attr(node,'ri:userkey') || attr(node,'ri:account-id') || attr(node,'ri:username');
      return `<span class="mention">@${E(one(context.db,'SELECT name FROM users WHERE id=?',id)?.name || id || 'Unbekannter Autor')}</span>`;
    }
    if (name === 'ac:task-list') return `<ul class="task-list">${children(node)}</ul>`;
    if (name === 'ac:task') return `<li><input type="checkbox" disabled ${text(child(node,'ac:task-status') || {children:[]}) === 'complete' ? 'checked' : ''}/><div>${children(child(node,'ac:task-body'))}</div></li>`;
    if (name === 'ac:emoticon') return `<span title="${E(attr(node,'ac:name'))}">${E(decodeStorageText(attr(node,'ac:emoji-fallback')) || ({'blue-star':'★',tick:'✓',cross:'✕',warning:'⚠',smile:'🙂',plus:'＋',minus:'−'})[attr(node,'ac:name')] || `:${attr(node,'ac:name')}:`)}</span>`;
    if (name === 'ac:adf-extension') {
      const primary = child(node,'ac:adf-node');
      return primary ? render(primary) : children(node);
    }
    if (name === 'ac:adf-node') {
      const type = attr(node,'type');
      const attributes = Object.fromEntries(elements(node).filter(n=>n.name==='ac:adf-attribute').map(n=>[attr(n,'key'),text(n)]));
      const content = elements(node).filter(n=>n.name!=='ac:adf-attribute').map(render).join('');
      if (type === 'panel') return `<aside class="panel panel-${E(attributes.panelType || 'info')}">${content}</aside>`;
      if (type === 'status') return `<span class="status status-${E((attributes.color || 'grey').toLowerCase())}">${E(attributes.text)}</span>`;
      if (type === 'mention') return `<span class="mention">${E(attributes.text || attributes.id)}</span>`;
      if (type === 'decision-list') return `<ul class="decision-list">${content}</ul>`;
      if (type === 'decision-item') return `<li>${content || '<span class="muted">Entscheidung ohne Text</span>'}</li>`;
      const extensionKey = attributes['extension-key'];
      if (extensionKey === 'links-menu') {
        const items = extensionParams(node)?.items;
        const renderItems = list => `<ul class="links-menu">${(list || []).map(item => `<li>${item.link ? link(resolveLink(item.link, context), E(item.title || item.link)) : `<span>${E(item.title || '')}</span>`}${item['child-items']?.length ? renderItems(item['child-items']) : ''}</li>`).join('')}</ul>`;
        return Array.isArray(items) && items.length ? renderItems(items) : fallback('ADF: extension (links-menu)', attributes, content, 'Keine Menüeinträge gespeichert.');
      }
      if (extensionKey === 'hub-section') {
        const p = extensionParams(node);
        return `<section class="hub-section" style="background-color:${E(cssVar(p['background-color']))}"><div class="hub-section-inner hub-width-${E(p['content-width'] || 'wide')}">${content}</div></section>`;
      }
      if (extensionKey === 'spotlight') {
        const p = extensionParams(node); const c = p.content || {};
        return `<div class="hub-spotlight hub-height-${E(p.height || 'medium')}" style="background-color:${E(cssVar(p['background-color']))}">${c.image?.['image-src'] ? image(c.image['image-src'], c.image['alt-text']) : ''}<div class="hub-spotlight-text" style="color:${E(cssVar(c.text?.['text-color']))}"><h3>${E(c.text?.title || '')}</h3><p>${E(c.text?.description || '')}</p>${c.button?.['is-button-shown'] === 'true' ? `<span class="hub-spotlight-button">${E(c.button.text || 'Mehr erfahren')}</span>` : ''}</div></div>`;
      }
      if (extensionKey === 'company-hub-search') {
        const styles = extensionParams(node).styles || {};
        return `<a class="hub-search" href="/b/${E(context.backupId)}/search">${E(styles.placeholder || 'Suche')}</a>`;
      }
      if (extensionKey === 'cards') {
        const p = extensionParams(node); const items = p.cards || [];
        return `<div class="hub-cards hub-cards-${E(p.orientation || 'row')}">${items.map(c => `<div class="hub-card">${c['image-src'] ? image(c['image-src'], c['image-alt-text']) : ''}<strong>${E(c.title || 'Ohne Titel')}</strong>${c.description ? `<p>${E(c.description)}</p>` : ''}${c.link ? link(resolveLink(c.link, context), 'Öffnen') : ''}</div>`).join('') || '<p class="muted">Keine Karten gespeichert.</p>'}</div>`;
      }
      if (extensionKey === 'carousel') {
        const items = extensionParams(node).cards || [];
        return `<div class="hub-cards hub-cards-row">${items.map(c => `<div class="hub-card" style="background-color:${E(cssVar(c['background-color']))};color:${E(cssVar(c['text-color']))}">${c['image-src'] ? image(c['image-src'], c['image-alt-text']) : ''}<strong>${E(c.title || '')}</strong>${c.description ? `<p>${E(c.description)}</p>` : ''}${c.link ? link(resolveLink(c.link, context), E(c['button-text'] || 'Mehr')) : ''}</div>`).join('') || '<p class="muted">Keine Einträge gespeichert.</p>'}</div>`;
      }
      return fallback(`ADF: ${type}`, attributes, content, 'Gespeicherte Erweiterung; externe Funktionen sind nicht verfügbar.');
    }
    if (name === 'ac:adf-content' || name === 'ac:rich-text-body' || name === 'ac:inline-comment-marker' || name === 'ac:adf-extension-frame') return children(node);
    if (name === 'ac:placeholder') return `<span class="muted">${children(node)}</span>`;
    if (name === 'ri:page') { const page=pageReference(node); return page ? link({href:contentUrl(context.backupId,page.id)}, E(page.title)) : missing(attr(node,'ri:content-title')); }
    if (name.startsWith('ac:') || name.startsWith('ri:')) return `<span class="unsupported-node" title="${E(name)}">${children(node)}</span>`;
    if (name === 'a') return link(resolveLink(attr(node,'href'),context),children(node));
    if (name === 'img') return image(attr(node, 'src'), attr(node, 'alt'));
    if (['script','style','iframe','object','embed','form','svg','math'].includes(name)) return '';
    const attrs = Object.entries(node.attribs || {}).filter(([k]) => ['id','class','style','colspan','rowspan','width','height','start','scope'].includes(k));
    if (headingIds.has(node)) { const index=attrs.findIndex(([k])=>k==='id'); if(index>=0)attrs.splice(index,1); attrs.push(['id',headingIds.get(node)]); }
    if (attr(node,'data-highlight-colour')) attrs.push(['style',`background-color:${attr(node,'data-highlight-colour')}`]);
    return `<${name}${attrs.map(([k,v])=>` ${k}="${E(v)}"`).join('')}>${children(node)}</${name}>`;
  }
  return sanitizeRendered(children(document));
}
