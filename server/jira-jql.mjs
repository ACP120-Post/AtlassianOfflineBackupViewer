import { rows } from './jira-import.mjs';
import { literal } from './jira-permissions.mjs';

export const JQL_HELP = 'AND, OR, NOT, Klammern; =, !=, IN, NOT IN, IS EMPTY, IS NOT EMPTY, ~, !~, <, <=, >, >=; ORDER BY. Felder: Projekt, Schlüssel, Typ, Status, Statuskategorie, Priorität, Lösung, Bearbeiter, Anfragender, Text, Datumsfelder, Labels, Komponenten, Versionen, Sprint und Custom Fields (Name oder cf[ID]). Funktionen: currentUser(), standardIssueTypes(), subtaskIssueTypes(), openSprints(), closedSprints(), futureSprints(). Unbekannte Felder, Operatoren und Funktionen liefern einen Fehler. Relative Datumswerte beziehen sich auf den Archivstand. SLA-Laufzeiten werden nicht weitergerechnet.';
export function compileJql(db, query = '', access, archiveDate) {
  const fail = message => { throw Object.assign(new Error(`JQL nicht auswertbar: ${message}`),{status:422}); };
  if (query.length > 8000) fail('maximal 8.000 Zeichen');
  const tokens = [];
  const re = /\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|cf\[\d+\]|>=|<=|!=|!~|[=~><(),]|[^\s=~!><(),]+)/gy;
  let offset = 0;
  while (offset < query.length && query.slice(offset).trim()) {
    re.lastIndex = offset; const match = re.exec(query); if (!match) fail(`unerwartetes Zeichen bei ${offset}`);
    const raw = match[1], quoted = /^["']/.test(raw);
    tokens.push({value:quoted?raw.slice(1,-1).replace(/\\(.)/g,'$1'):raw,quoted}); offset = re.lastIndex;
  }
  if (tokens.length > 1500) fail('zu viele Ausdrücke');
  let pos = 0, depth = 0;
  const is = value => !tokens[pos]?.quoted && tokens[pos]?.value.toUpperCase() === value;
  const take = value => {if(is(value)){pos++;return true;}return false;};
  const need = value => {if(!take(value))fail(`${value} erwartet`);};
  const next = () => {if(!tokens[pos])fail('unvollständiger Ausdruck');return tokens[pos++].value;};
  const custom = rows(db,'CustomField');
  const options = rows(db,'CustomFieldOption');
  const named = (kind,value) => rows(db,kind).filter(r=>r.id===value || r.name?.toLowerCase()===value.toLowerCase()).map(r=>r.id);
  function field(name, sort = false) {
    const key = name.toLowerCase();
    const scalar = {key:'key',issuekey:'key',id:'id',summary:'summary',description:'description',created:'created',updated:'updated',due:'due',duedate:'due',assignee:'assignee',reporter:'reporter',resolution:'resolution',status:'status',priority:'priority',issuetype:'type',type:'type',project:'project',archived:'archived',rank:'rank'};
    const kinds = {project:'Project',status:'Status',issuetype:'IssueType',type:'IssueType',priority:'Priority',resolution:'Resolution'};
    if (scalar[key]) return {expr:sort&&key==='priority'?"(SELECT CAST(json_extract(data,'$.sequence') AS INTEGER) FROM records WHERE kind='Priority' AND id=i.priority)":`i.${scalar[key]}`, kind:kinds[key],key};
    if (key==='text') return {expr:"(i.summary||' '||i.description)",key};
    if (key==='statuscategory') return {expr:"(SELECT json_extract(data,'$.statuscategory') FROM records WHERE kind='Status' AND id=i.status)",key};
    const relations = {labels:['Label','label'],label:['Label','label'],component:['IssueComponent','component','Component'],fixversion:['FixVersion','version','Version'],affectedversion:['AffectsVersion','version','Version'],sprint:['IssueSprint','sprint_id','Sprint']};
    if (relations[key]) {
      const [kind,column,valueKind] = relations[key];
      return {select:`SELECT json_extract(r.data,'$.${column}') v FROM records r WHERE r.kind=${literal(kind)} AND r.parent=i.id`,kind:valueKind,key};
    }
    const id = /^cf\[(\d+)\]$/i.exec(name)?.[1] || /^customfield_(\d+)$/i.exec(name)?.[1];
    const matches = custom.filter(f=> id?f.id===id:f.name?.toLowerCase()===key || f.name?.toLowerCase()===key.replace(/\[(?:dropdown|text|number|date)\]$/,''));
    if(matches.length!==1)fail(`Feld „${name}“ ist unbekannt oder nicht eindeutig`);
    const f = matches[0];
    if (sort && f.customfieldtypekey?.includes('sd-sla-field')) fail(`SLA-Sortierung „${name}“ benötigt nicht exportierte Indexwerte`);
    return {select:`SELECT value v FROM custom_values WHERE issue=i.id AND field=${literal(f.id)}`,field:f,numeric:/:(?:float|number|rating)$/.test(f.customfieldtypekey||''),key};
  }
  function values(f) {
    if (take('(')) { const result=[];do{result.push(...values(f));}while(take(','));need(')');return result; }
    const quoted = tokens[pos]?.quoted;
    const value = next();
    if (!quoted && take('(')) {
      need(')');
      switch(value.toLowerCase()) {
        case 'currentuser': return [...access.keys];
        case 'standardissuetypes': return rows(db,'IssueType').filter(r=>Number(r.hierarchy_level ?? 0)>=0).map(r=>r.id);
        case 'subtaskissuetypes': return rows(db,'IssueType').filter(r=>Number(r.hierarchy_level)<0).map(r=>r.id);
        case 'opensprints': return rows(db,'Sprint').filter(r=>r.started==='true'&&r.closed!=='true').map(r=>r.id);
        case 'closedsprints': return rows(db,'Sprint').filter(r=>r.closed==='true').map(r=>r.id);
        case 'futuresprints': return rows(db,'Sprint').filter(r=>r.started!=='true'&&r.closed!=='true').map(r=>r.id);
        default: fail(`Funktion ${value}() wird nicht unterstützt`);
      }
    }
    if (f.key==='resolution' && /^(unresolved|empty|null)$/i.test(value)) return [''];
    if(f.key==='statuscategory')return [{todo:'2',new:'2','in progress':'4',indeterminate:'4',done:'3'}[value.toLowerCase()]||value];
    if (['created','updated','due','duedate'].includes(f.key) && /^-?\d+[mhdw]$/.test(value)) {
      const base = Date.parse(archiveDate); if(!Number.isFinite(base))fail('Archivdatum für relative Datumswerte fehlt');
      return [new Date(base+parseInt(value)*({m:60000,h:3600000,d:86400000,w:604800000}[value.at(-1)])).toISOString().replace('T',' ').slice(0,19)];
    }
    if (f.kind) {
      if(f.kind==='Project') {const aliases=rows(db,'ProjectKey').filter(p=>p.projectkey?.toLowerCase()===value.toLowerCase()).map(p=>p.projectid);const found=rows(db,'Project').filter(p=>[p.id,p.key,p.name].some(x=>x?.toLowerCase()===value.toLowerCase())).map(p=>p.id);return found.length||aliases.length?[...new Set([...found,...aliases])]:[value];}
      const found=named(f.kind,value);return found.length?found:[value];
    }
    if(f.field) {
      if(f.field.customfieldtypekey==='com.atlassian.servicedesk:vp-origin') {
        const portals=rows(db,'Portal'),projects=rows(db,'Project');
        const types=rows(db,'RequestType').filter(t=>{const p=portals.find(p=>p.id===t.viewport_id),project=projects.find(pr=>pr.id===p?.project_id);return [t.name,`${t.name} (${project?.key})`,`${p?.key}/${t.key}`].some(n=>n?.toLowerCase()===value.toLowerCase());});
        if(types.length)return types.map(t=>`${portals.find(p=>p.id===t.viewport_id)?.key}/${t.key}`);
      }
      const found=options.filter(o=>o.customfield===f.field.id && (o.value?.toLowerCase()===value.toLowerCase()||o.id===value)).map(o=>o.id);
      if(found.length)return found;
    }
    return [value];
  }
  function atom() {
    if(++depth>32)fail('zu tief verschachtelt');
    let result;
    if(take('NOT')) result=`NOT (${atom()})`;
    else if(take('(')){result=or();need(')');}
    else {
      const f=field(next()); let op=next().toUpperCase();
      if(op==='NOT'){need('IN');op='NOT IN';}
      const expr=f.select?'v':f.expr;
      let condition;
      if(op==='IS') {
        const not=take('NOT');if(!take('EMPTY')&&!take('NULL'))fail('EMPTY erwartet');
        condition=`COALESCE(${expr},'')${not?'<>':'='}''`;
        result=f.select?(not?`EXISTS(SELECT 1 FROM (${f.select}) WHERE ${condition})`:`NOT EXISTS(SELECT 1 FROM (${f.select}) WHERE COALESCE(v,'')<>'')`):condition;
      } else {
        if(!['=','!=','IN','NOT IN','~','!~','>','<','>=','<='].includes(op))fail(`Operator ${op} wird nicht unterstützt`);
        const vals=values(f);
        if(['~','!~'].includes(op)) {
          if(vals.length!==1 || /[*?]/.test(vals[0]))fail('Textsuche unterstützt literale Teilzeichenfolgen ohne Wildcards');
          condition=`instr(lower(${expr}),lower(${literal(vals[0])}))${op==='~'?'>':'='}0`;
        } else if(['>','<','>=','<='].includes(op)) {
          if(vals.length!==1)fail('genau ein Vergleichswert erwartet');
          if(f.numeric&&!/^-?\d+(?:\.\d+)?$/.test(vals[0]))fail('numerischer Vergleichswert erwartet');
          condition=f.numeric?`CAST(${expr} AS REAL) ${op} CAST(${literal(vals[0])} AS REAL)`:`${expr} ${op} ${literal(vals[0])}`;
        } else condition=`${expr} ${['!=','NOT IN'].includes(op)?'NOT IN':'IN'} (${vals.map(literal).join(',')||'NULL'})`;
        if(['!=','NOT IN','!~'].includes(op)) condition=`(${condition} AND COALESCE(${expr},'')<>'')`;
        if(f.select && ['!=','NOT IN','!~'].includes(op)) result=`(EXISTS(SELECT 1 FROM (${f.select}) WHERE COALESCE(v,'')<>'') AND NOT EXISTS(SELECT 1 FROM (${f.select}) WHERE ${op==='!~'?`instr(lower(v),lower(${literal(vals[0])}))>0`:`v IN (${vals.map(literal).join(',')||'NULL'})`}))`;
        else result=f.select?`EXISTS(SELECT 1 FROM (${f.select}) WHERE ${condition})`:condition;
      }
    }
    depth--;return `(${result})`;
  }
  function and(){let result=atom();while(take('AND'))result=`(${result} AND ${atom()})`;return result;}
  function or(){let result=and();while(take('OR'))result=`(${result} OR ${and()})`;return result;}
  const where = pos<tokens.length&&!is('ORDER')?or():'1';
  const order=[];
  if(take('ORDER')){need('BY');do{const f=field(next(),true);const direction=take('DESC')?'DESC':(take('ASC'),'ASC');order.push(`${f.select?`(SELECT ${f.numeric?'CAST(v AS REAL)':'v'} FROM (${f.select}) LIMIT 1)`:f.expr} ${direction}`);}while(take(','));}
  if(pos!==tokens.length)fail(`unerwartet: ${tokens[pos].value}`);
  return {where,order:order.length?order.join(', '):'i.updated DESC, i.id'};
}
