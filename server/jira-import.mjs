import { DatabaseSync } from 'node:sqlite';
import { rename, rm } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { SaxesParser } from 'saxes';

export const JIRA_FORMAT_VERSION = 2;
export const rows = (db, kind, parent) => db.prepare(`SELECT data FROM records WHERE kind=?${parent === undefined ? '' : ' AND parent=?'} ORDER BY rowid`).all(kind, ...(parent === undefined ? [] : [String(parent)])).map(r => JSON.parse(r.data));
export const row = (db, kind, id) => { const r = db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, String(id || '')); return r && JSON.parse(r.data); };

// Explicit column allowlists: never retain exported credentials, mail settings, app tokens or arbitrary properties.
const specs = {};
function spec(kind, fields, parent = '', alias = kind) { specs[kind] = { fields: new Set(fields.toLowerCase().split(' ')), parent, alias }; }
spec('Project', 'id name key description lead projecttype permissionscheme issuesecurityscheme workflowscheme status created updated');
spec('ProjectKey', 'id projectid projectkey', 'projectid');
spec('MovedIssueKey', 'id oldissuekey issueid', 'issueid');
spec('Issue', 'id key projectkey number project reporter assignee creator type summary description descriptionadf priority resolution status created updated duedate resolutiondate security securitylevel timespent timeestimate timeoriginalestimate environment environmentadf effectiveSubtaskParentId softArchived lifecycleState', 'project');
spec('User', 'id username lowerusername displayname emailaddress externalid active localservicedeskuser');
spec('ApplicationUser', 'id userkey lowerusername');
spec('Group', 'id groupname externalid active');
spec('Membership', 'id parentid childid membershiptype parentname childname', 'childid');
spec('LicenseRoleGroup', 'id licenserolename groupid');
spec('ProjectRole', 'id name description');
spec('ProjectRoleActor', 'id pid projectroleid roletype roletypeparameter', 'pid');
spec('PermissionScheme', 'id name description');
spec('SchemePermissions', 'id scheme permission permissionkey type parameter', 'scheme');
spec('IssueSecurityScheme', 'id name description defaultlevel');
spec('SchemeIssueSecurityLevels', 'id name description scheme', 'scheme');
spec('SchemeIssueSecurities', 'id scheme security type parameter', 'security');
spec('Action', 'id issue author type body bodyadf created updated rolelevel level commentvisibility', 'issue');
spec('ChangeGroup', 'id issue author created', 'issue');
spec('ChangeItem', 'id group fieldtype field fieldid oldvalue oldstring newvalue newstring', 'group');
spec('CustomField', 'id name description customfieldtypekey scope projectconfigurationid');
spec('CustomFieldValue', 'id issue customfield stringvalue textvalue numbervalue datevalue', 'issue');
spec('CustomFieldValueMultiSelect', 'id issue customfield optionid', 'issue');
spec('CustomFieldGroupPickerValue', 'id issueid customfieldid groupidentifier', 'issueid');
spec('CustomFieldOption', 'id customfield parentoptionid value sequence disabled', 'customfield');
spec('IssueLink', 'id linktype source destination', 'source');
spec('IssueLinkType', 'id linkname inward outward style');
spec('IssueParentAssociation', 'issueid parentid', 'issueid');
spec('RemoteIssueLink', 'id issueid title url relationship', 'issueid');
spec('Version', 'id project name description released archived releasedate startdate sequence', 'project');
spec('Component', 'id project name description lead assigneetype', 'project');
spec('FixVersion', 'issue version', 'issue');
spec('AffectsVersion', 'issue version', 'issue');
spec('IssueComponent', 'issue component', 'issue');
spec('Label', 'id issue label', 'issue');
spec('Worklog', 'id issue author body bodyadf created updated startdate timeworked rolelevel grouplevel', 'issue');
spec('FileAttachment', 'id issue filename mimetype filesize author created', 'issue');
for (const k of ['Status','Priority','Resolution','IssueType']) spec(k, 'id name description sequence statuscategory hierarchy_level');
spec('SearchRequest', 'id name author user description request');
spec('SharePermissions', 'id entityid entitytype type param1 param2 rights', 'entityid');
spec('PortalPage', 'id pagename username description layout');
spec('PortletConfiguration', 'id portalpage columnnumber position gadgetxml', 'portalpage');
spec('GadgetUserPreference', 'id portletconfiguration userprefkey userprefvalue', 'portletconfiguration');
spec('WorkflowScheme', 'id name description');
spec('WorkflowSchemeEntity', 'id scheme workflow issuetype', 'scheme');
spec('WorkflowStatuses', 'id status parentname', 'parentname');
spec('EntityProperty', 'id entityname entityid propertykey value', 'entityid');
spec('OSPropertyEntry', 'id entityname entityid propertykey', 'entityid');
spec('OSPropertyString', 'id value');
spec('OSPropertyText', 'id value');
const ao = (suffix, fields, parent = '', alias = suffix, prefix = 'AO_54307E_') => spec(prefix + suffix, fields, parent, alias);
ao('RAPIDVIEW','id name saved_filter_id parent_project_id owner_user_name sprints_enabled backlog_type old_done_issues_cutoff','parent_project_id','Board','AO_60DB71_');
ao('COLUMN','id name pos rapid_view_id minim maxim','rapid_view_id','BoardColumn','AO_60DB71_');
ao('COLUMNSTATUS','id column_id status_id','','ColumnStatus','AO_60DB71_');
ao('SPRINT','id name goal rapid_view_id started closed start_date end_date complete_date sequence','rapid_view_id','Sprint','AO_60DB71_');
ao('QUICKFILTER','id name query long_query rapid_view_id pos','rapid_view_id','QuickFilter','AO_60DB71_');
ao('SUBQUERY','id query long_query rapid_view_id section','rapid_view_id','BoardSubquery','AO_60DB71_');
ao('SWIMLANE','id name query long_query rapid_view_id pos default_lane','rapid_view_id','Swimlane','AO_60DB71_');
ao('LEXORANK','id issue_id rank type','issue_id','Rank','AO_60DB71_');
spec('ISSUESPRINT_60DB71','issue_id sprint_id','issue_id','IssueSprint');
spec('COLUMNSTATUS_60DB71','column_id status_id','column_id','ColumnStatus');
ao('SERVICEDESK','id project_id project_key disabled created_date open_customer_access','project_id','ServiceDesk');
ao('QUEUE','id jql project_id name queue_order category rapidview_id','project_id','Queue');
ao('QUEUECOLUMN','id queue_id column_id column_order','queue_id','QueueColumn');
ao('VIEWPORT','id name description key project_id hide_portal','project_id','Portal');
ao('VIEWPORTFORM','id name description intro key viewport_id issue_type_id form_order rt_category_id','viewport_id','RequestType');
ao('VIEWPORTFIELD','id field_id field_type form_id label description displayed required field_order','form_id','RequestField');
ao('VIEWPORTFIELDVALUE','id field_id field_name value value_v2 value_order','field_id','RequestFieldValue');
ao('GROUP','id group_name viewport_id deleted_time order','viewport_id','PortalGroup');
ao('GROUPTOREQUESTTYPE','id group_id request_type_id order','group_id','PortalGroupType');
ao('REQUESTTYPE_TO_ISSUE','id issue_id portal_key request_type_key','issue_id','IssueRequestType');
ao('ORGANIZATION','id name status','','Organization');
ao('ORGANIZATION_MEMBER','id organization_id user_key is_deleted','organization_id','OrganizationMember');
ao('ORGANIZATION_PROJECT','id organization_id project_id','project_id','OrganizationProject');
ao('TIMEMETRIC','id name custom_field_id service_desk_id','service_desk_id','TimeMetric');
ao('SLASEARCHINDEX','id issue_id time_metric_id custom_field_id last_cycle_state last_timeline_cycle_state last_complete_cycle_end_date last_complete_cycle_failed any_complete_cycle_failed paused_cycle_elapsed_time paused_cycle_remaining_time timeline','issue_id','Sla');
ao('REPORT','id name service_desk_id report_order report_type target','service_desk_id','ServiceReport');
ao('SERIES','id report_id jql series_data_type series_label time_metric_id goal_id','report_id','ReportSeries');
ao('GOAL','id time_metric_id jql_query target_duration pos','time_metric_id','SlaGoal');

export async function parseJiraXml(source, activeObjects, emit, root = () => {}) {
  const parser = new SaxesParser({ xmlns: true });
  const decoder = new StringDecoder('utf8');
  let depth = 0, record, kind, child, table, columns = [], values, cell, text = '', bytes = 0;
  parser.on('doctype', () => { throw new Error('DTD und externe XML-Entitäten sind nicht erlaubt'); });
  parser.on('opentag', tag => {
    depth++; if (depth > 64) throw new Error('XML ist zu tief verschachtelt');
    const name = tag.local, attrs = Object.fromEntries(Object.values(tag.attributes).filter(a => a.uri !== 'http://www.w3.org/2000/xmlns/').map(a => [a.local.toLowerCase(), a.value]));
    if (depth === 1) { if (name !== (activeObjects ? 'backup' : 'entity-engine-xml')) throw new Error('Unbekanntes Jira-XML-Format'); root(attrs); }
    if (!activeObjects) {
      if (depth === 2) { kind = name; record = attrs; bytes = JSON.stringify(attrs).length; }
      if (depth === 3) { child = name.toLowerCase(); text = ''; }
    } else {
      if (depth === 2 && name === 'data') { table = attrs.tablename; columns = []; }
      if (depth === 3 && table && name === 'column') columns.push(attrs.name.toLowerCase());
      if (depth === 3 && table && name === 'row') { values = []; bytes = 0; }
      if (depth === 4 && values) { cell = attrs.nil === 'true' ? null : ''; text = ''; }
    }
  });
  const append = value => { if ((!activeObjects && depth >= 3) || (activeObjects && values && depth === 4)) { bytes += value.length; if (bytes > 64 * 1024 * 1024) throw new Error('XML-Datensatz ist zu groß'); text += value; } };
  parser.on('text', append); parser.on('cdata', append);
  parser.on('closetag', tag => {
    if (!activeObjects) {
      if (depth === 3) record[child] = text;
      if (depth === 2) { emit(kind, record); record = null; }
    } else {
      if (depth === 4 && values) values.push(cell === null ? null : text);
      if (depth === 3 && tag.local === 'row' && values) {
        if (values.length !== columns.length) throw new Error(`Unvollständige AO-Zeile: ${table}`);
        emit(table, Object.fromEntries(columns.map((c,i) => [c, values[i]]))); values = null;
      }
      if (depth === 2 && tag.local === 'data') table = null;
    }
    depth--;
  });
  for await (const chunk of source) parser.write(decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  parser.write(decoder.end()).close();
}

export async function importJira(archive, target, hash) {
  const temp = `${target}.${process.pid}.tmp`;
  await rm(temp, { force: true });
  const db = new DatabaseSync(temp);
  const counts = {}, skipped = {}, warnings = [];
  let archiveDate = null;
  try {
    db.exec(`PRAGMA journal_mode=DELETE; BEGIN;
      CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,parent TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE files(id TEXT PRIMARY KEY,entry TEXT,size INTEGER);
    `);
    const insert = db.prepare('INSERT INTO records VALUES(?,?,?,?)');
    const emit = (kind, original) => {
      const s = specs[kind];
      if (!s) { skipped[kind] = (skipped[kind] || 0) + 1; return; }
      if (kind === 'EntityProperty' && !(['CommentProperty','sd.comment.property'].includes(original.entityname) && original.propertykey === 'sd.public.comment')) return;
      if (kind === 'GadgetUserPreference' && !['filterId','num','columns','refresh','projectId'].includes(original.userprefkey)) return;
      if (kind === 'OSPropertyEntry' && !/^GreenHopper\.RapidView\.\d+\.columnStatuses$/.test(original.propertykey || '')) return;
      // Property values are joined to their explicit safe keys after parsing; never retain arbitrary property values.
      if (kind === 'OSPropertyString' || kind === 'OSPropertyText') {
        if (!db.prepare("SELECT 1 FROM records WHERE kind='OSPropertyEntry' AND id=?").get(original.id)) return;
      }
      const data = Object.fromEntries(Object.entries(original).filter(([k]) => s.fields.has(k)));
      const n = counts[s.alias] = (counts[s.alias] || 0) + 1;
      insert.run(s.alias, data.id || `${s.alias}:${n}`, data[s.parent] || '', JSON.stringify(data));
    };
    // Index also supports the small, explicitly allowed OS property lookup during streaming.
    db.exec('CREATE UNIQUE INDEX records_id ON records(kind,id); CREATE INDEX records_parent ON records(kind,parent);');
    await parseJiraXml(await archive.stream('entities.xml'), false, emit, r => { const date=/^\d{12,}$/.test(r.date||'')?Number(r.date):r.date; archiveDate = date && Number.isFinite(new Date(date).getTime()) ? new Date(date).toISOString() : null; });
    if (!counts.Project) throw new Error('Jira-Projekte fehlen');
    if (archive.entries.has('activeobjects.xml')) await parseJiraXml(await archive.stream('activeobjects.xml'), true, emit);
    else warnings.push({ message: 'activeobjects.xml fehlt: Software- und JSM-Konfiguration nicht verfügbar' });
    db.exec(`CREATE TABLE issues AS SELECT id, json_extract(data,'$.project') AS project,
      COALESCE(json_extract(data,'$.key'),json_extract(data,'$.projectkey')||'-'||json_extract(data,'$.number')) AS key,
      COALESCE(json_extract(data,'$.summary'),'') AS summary, COALESCE(json_extract(data,'$.description'),'') AS description,
      COALESCE(json_extract(data,'$.status'),'') AS status,COALESCE(json_extract(data,'$.type'),'') AS type,
      COALESCE(json_extract(data,'$.priority'),'') AS priority,COALESCE(json_extract(data,'$.resolution'),'') AS resolution,
      COALESCE(json_extract(data,'$.reporter'),'') AS reporter,COALESCE(json_extract(data,'$.assignee'),'') AS assignee,
      COALESCE(json_extract(data,'$.security'),json_extract(data,'$.securitylevel'),'') AS security,
      COALESCE(json_extract(data,'$.created'),'') AS created,COALESCE(json_extract(data,'$.updated'),'') AS updated,
      COALESCE(json_extract(data,'$.duedate'),'') AS due,COALESCE(json_extract(data,'$.softarchived'),'false') AS archived,
      '' AS rank FROM records WHERE kind='Issue';
      CREATE UNIQUE INDEX issues_id ON issues(id); CREATE UNIQUE INDEX issues_key ON issues(key COLLATE NOCASE);
      CREATE INDEX issues_project ON issues(project); CREATE INDEX issues_security ON issues(security);
      CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,external_id TEXT,username TEXT,active INTEGER);
      INSERT INTO users SELECT COALESCE(json_extract(a.data,'$.userkey'),json_extract(u.data,'$.username')),json_extract(u.data,'$.displayname'),
        json_extract(u.data,'$.externalid'),json_extract(u.data,'$.username'),json_extract(u.data,'$.active') IN ('1','true')
        FROM records u LEFT JOIN records a ON a.kind='ApplicationUser' AND json_extract(a.data,'$.lowerusername')=json_extract(u.data,'$.lowerusername') WHERE u.kind='User';
      CREATE INDEX users_external ON users(external_id);
      CREATE TABLE custom_values(issue TEXT,field TEXT,value TEXT);
      INSERT INTO custom_values SELECT parent,json_extract(data,'$.customfield'),COALESCE(json_extract(data,'$.stringvalue'),json_extract(data,'$.textvalue'),json_extract(data,'$.numbervalue'),json_extract(data,'$.datevalue'),'') FROM records WHERE kind='CustomFieldValue';
      INSERT INTO custom_values SELECT parent,json_extract(data,'$.customfield'),json_extract(data,'$.optionid') FROM records WHERE kind='CustomFieldValueMultiSelect';
      INSERT INTO custom_values SELECT parent,json_extract(data,'$.customfieldid'),json_extract(data,'$.groupidentifier') FROM records WHERE kind='CustomFieldGroupPickerValue';
      CREATE INDEX custom_issue ON custom_values(issue,field); CREATE INDEX custom_field ON custom_values(field,value);
      CREATE INDEX links_destination ON records(kind,json_extract(data,'$.destination')) WHERE kind='IssueLink';
    `);
    const rank = db.prepare('UPDATE issues SET rank=? WHERE id=?');
    for (const r of rows(db, 'Rank')) if (r.type === '1') rank.run(r.rank || '', r.issue_id);
    const putFile = db.prepare('INSERT INTO files VALUES(?,?,?)');
    for (const a of rows(db,'FileAttachment')) {
      const issue = db.prepare('SELECT key FROM issues WHERE id=?').get(a.issue);
      const paths = [`data/attachments/${issue?.key?.split('-')[0]}/${issue?.key}/${a.id}`, `attachments/${issue?.key?.split('-')[0]}/${issue?.key}/${a.id}`, `attachments/${a.id}`];
      const entry = paths.find(p => archive.entries.has(p));
      if (entry) putFile.run(a.id, entry, archive.entries.get(entry).uncompressedSize);
      else warnings.push({ id:a.id, message:'Anhangdatei fehlt im Archiv' });
    }
    for (const r of db.prepare("SELECT i.id FROM issues i LEFT JOIN records p ON p.kind='Project' AND p.id=i.project WHERE p.id IS NULL").all()) warnings.push({id:r.id,message:'Projektverknüpfung fehlt; Vorgang bleibt gesperrt'});
    for (const r of db.prepare("SELECT r.id FROM records r LEFT JOIN issues i ON i.id=r.parent WHERE r.kind IN ('Action','FileAttachment','ChangeGroup','Worklog','IssueRequestType') AND i.id IS NULL").all()) warnings.push({id:r.id,message:'Vorgangsverknüpfung fehlt'});
    for(const [kind,field,target] of [['FixVersion','version','Version'],['IssueComponent','component','Component'],['IssueSprint','sprint_id','Sprint'],['Board','saved_filter_id','SearchRequest'],['BoardColumn','rapid_view_id','Board'],['ColumnStatus','status_id','Status'],['IssueRequestType','portal_key','Portal']]) {
      const targetField=target==='Portal'?"json_extract(t.data,'$.key')":'t.id';
      const missing=db.prepare(`SELECT json_extract(r.data,'$.${field}') target,count(*) count FROM records r LEFT JOIN records t ON t.kind=? AND ${targetField}=json_extract(r.data,'$.${field}') WHERE r.kind=? AND t.id IS NULL GROUP BY target`).all(target,kind);
      for(const m of missing)warnings.push({message:`Fehlende Verknüpfung ${kind} → ${target}: ${m.target} (${m.count} Datensätze)`});
    }
    const supportedRules = new Set(['group','user','projectrole','applicationRole','reporter','assignee','lead','userCF','groupCF','sd.customer.portal.only']);
    for (const kind of ['SchemePermissions','SchemeIssueSecurities']) for (const r of rows(db,kind)) if (!supportedRules.has(r.type)) warnings.push({id:r.id,message:`Nicht unterstützte Berechtigungsregel: ${r.type}; gewährt keinen Zugriff`});
    const files = db.prepare('SELECT count(*) n FROM files').get().n;
    const report = { product:'jira', archiveDate, importedAt:new Date().toISOString(), formatVersion:JIRA_FORMAT_VERSION,
      counts:{...counts,projects:counts.Project||0,issues:counts.Issue||0,boards:counts.Board||0,serviceDesks:counts.ServiceDesk||0,queues:counts.Queue||0,files},
      warnings, skipped, features:{software:!!counts.Board,jsm:!!counts.ServiceDesk,attachments:files>0} };
    const meta = db.prepare('INSERT INTO metadata VALUES(?,?)');
    for (const [k,v] of Object.entries({fingerprint:hash,formatVersion:String(JIRA_FORMAT_VERSION),product:'jira',report:JSON.stringify(report)})) meta.run(k,v);
    db.exec('COMMIT; PRAGMA optimize;'); db.close(); await rename(temp,target);
  } catch (error) { db.close(); await rm(temp,{force:true}); throw error; }
}
