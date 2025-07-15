import { pipeline } from 'node:stream/promises';
import { rows, row } from './jira-import.mjs';
import { jiraAccess, literal, parseJson } from './jira-permissions.mjs';
import { compileJql, JQL_HELP } from './jira-jql.mjs';
import { renderJira } from './jira-render.mjs';
import { originalIssueUrl } from './original-links.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const one=(db,sql,...args)=>db.prepare(sql).get(...args);
const all=(db,sql,...args)=>db.prepare(sql).all(...args);
const sorted=(rs,key)=>rs.sort((a,b)=>Number(a[key]||0)-Number(b[key]||0));
export async function jiraApi({req,res,url,parts,backup,identity,identityDb,isAdmin,json}) {
  const db=backup.db, access=jiraAccess(backup,identity,identityDb);
  const portal=parts[4]==='portal';
  const resource=parts[portal?5:4] || (portal?'portals':'projects'), id=parts[portal?6:5];
  const projectById=new Map(access.projects.map(p=>[p.id,p]));
  const safeProjects=access.projects.filter(p=>access.canProject(p,portal));
  const projectIds=new Set(safeProjects.map(p=>p.id));
  const context={db,backupId:backup.id,portal};
  const render=value=>renderJira(value,context);
  // ponytail: Status/IssueType/Priority sind pro Backup eine Handvoll Zeilen – einmal in eine Map statt pro Tabellenzelle eine Abfrage.
  const lookups={};
  const lookup=kind=>lookups[kind]||=new Map(rows(db,kind).map(r=>[r.id,r]));
  const name=(kind,id)=>lookup(kind).get(String(id??''))?.name||id||'–';
  const category=id=>lookup('Status').get(String(id??''))?.statuscategory||'';
  const user=id=>one(db,'SELECT name FROM users WHERE id=? OR username=?',id||'',id||'')?.name||id||'Nicht zugewiesen';
  const canShare=(type,id,owner)=>access.keys.has(owner)||rows(db,'SharePermissions',id).some(s=>s.entitytype===type &&
    (s.type==='global'||s.type==='loggedin'||(s.type==='group'&&access.groups.has(s.param1))||(s.type==='project'&&projectIds.has(s.param1)&&(!s.param2||access.role(projectById.get(s.param1),s.param2)))));
  const customField=()=>lookups.fields||=rows(db,'CustomField');
  // Feldtyp aus dem Exportschlüssel ableiten – der Export speichert alle Werte als Text.
  const fieldType=key=>{const k=(key||'').toLowerCase();
    return /datetime/.test(k)?'datetime':/datepicker/.test(k)?'date':/userpicker|sd-request-participants/.test(k)?'user':
      /sd-customer-organizations/.test(k)?'organization':/grouppicker/.test(k)?'group':/labels/.test(k)?'labels':
      /float|number|rating/.test(k)?'number':/url/.test(k)?'url':/textarea|description/.test(k)?'html':
      /select|radiobuttons|checkbox|priority|version|project|issuetype/.test(k)?'option':'text';};
  const typedField=(f,raw)=>{const type=fieldType(f.customfieldtypekey);
    return {...f,type,values:raw.map(v=>{const option=row(db,'CustomFieldOption',v)?.value;
      const text=type==='user'?user(v):type==='organization'?(row(db,'Organization',v)?.name||v):option||v;
      return type==='html'?{type,text,html:render(v)}:{type,text};})};};
  const fieldText=(fieldId,issueId)=>{const f=customField().find(f=>f.id===fieldId);const raw=all(db,'SELECT value FROM custom_values WHERE issue=? AND field=?',issueId,fieldId).map(v=>v.value);
    return (f?typedField(f,raw).values.map(v=>v.text):raw).join(', ');};
  // Story Points und Startdatum haben in Jira keine feste ID – einmal pro Anfrage über Typ und Name suchen.
  const special=()=>lookups.special||=({
    points:customField().find(f=>/:float$/.test(f.customfieldtypekey||'')&&/story ?points|story-?punkte/i.test(f.name||''))?.id,
    start:customField().find(f=>/datepicker|datetime/.test(f.customfieldtypekey||'')&&/start/i.test(f.name||''))?.id});
  const parentKey=issueId=>{const parent=rows(db,'IssueParentAssociation',issueId)[0]?.parentid;return parent?one(db,'SELECT key FROM issues WHERE id=?',parent)?.key||null:null;};
  const boardStatuses=columnId=>rows(db,'ColumnStatus').filter(s=>s.column_id===columnId).map(s=>s.status_id);
  const parentOf=issueId=>rows(db,'IssueParentAssociation',issueId)[0]?.parentid||null;
  const day=v=>{const d=new Date(/^\d{12,}$/.test(String(v))?Number(v):v);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):null;};
  // Zeitleiste: nur Vorgänge mit echtem Start- UND Fälligkeitsdatum bekommen einen Balken; alles andere wird als datumslos gelistet.
  const timeline=(p,versions)=>{
    const scope=`i.project=${literal(p.id)}`,start=special().start;
    const starts=new Map(start?all(db,`SELECT cv.issue issue,cv.value value FROM custom_values cv JOIN issues i ON i.id=cv.issue WHERE cv.field=${literal(start)} AND ${access.sql()} AND ${scope}`).map(r=>[r.issue,day(r.value)]):[]);
    const dated=all(db,`SELECT i.* FROM issues i WHERE ${access.sql()} AND ${scope} AND ifnull(i.due,'')!='' ORDER BY i.due LIMIT 500`)
      .map(i=>({issue:i,from:starts.get(i.id),to:day(i.due)})).filter(b=>b.from&&b.to&&b.from<=b.to)
      .map(b=>({...summarize(b.issue),start:b.from,end:b.to,parentId:parentOf(b.issue.id)}));
    const isEpic=i=>Number(i.typeLevel||0)>0;
    const byParent=new Map();for(const b of dated.filter(b=>b.parentId))byParent.set(b.parentId,[...(byParent.get(b.parentId)||[]),b]);
    const epics=dated.filter(isEpic);
    for(const [parentId,children] of byParent)if(!epics.some(e=>e.id===parentId)){
      const raw=one(db,'SELECT * FROM issues WHERE id=?',parentId);
      if(raw&&access.canIssue(parentId))epics.push({...summarize(raw),start:children.map(c=>c.start).sort()[0],end:children.map(c=>c.end).sort().pop(),derived:true});
    }
    const lanes=epics.map(e=>({...e,children:(byParent.get(e.id)||[]).filter(c=>c.id!==e.id)}));
    const loose=dated.filter(b=>!isEpic(b)&&!epics.some(e=>e.id===b.parentId));
    const undated=all(db,`SELECT i.* FROM issues i WHERE ${access.sql()} AND ${scope} ORDER BY i.updated DESC LIMIT 300`).map(summarize)
      .filter(i=>isEpic(i)&&!lanes.some(l=>l.id===i.id)).slice(0,50);
    const sprints=rows(db,'Board').filter(b=>b.parent_project_id===p.id).flatMap(b=>rows(db,'Sprint',b.id)).map(s=>({id:s.id,name:s.name,start:day(s.start_date),end:day(s.end_date),closed:s.closed==='true'})).filter(s=>s.start&&s.end);
    const releases=versions.filter(v=>day(v.releasedate)).map(v=>({id:v.id,name:v.name,date:day(v.releasedate),start:day(v.startdate),released:v.released==='true'}));
    const stamps=[...lanes.flatMap(l=>[l.start,l.end,...l.children.flatMap(c=>[c.start,c.end])]),...loose.flatMap(b=>[b.start,b.end]),...sprints.flatMap(s=>[s.start,s.end]),...releases.flatMap(r=>[r.start,r.date])].filter(Boolean).sort();
    return {start:stamps[0]||null,end:stamps[stamps.length-1]||null,lanes,loose,undated,sprints,releases,
      startFieldName:start&&customField().find(f=>f.id===start)?.name||null};
  };
  const filterById=filterId=>{const f=row(db,'SearchRequest',filterId);if(!f||!canShare('SearchRequest',f.id,f.author||f.user))fail(404,'Gespeicherter Filter ist nicht verfügbar');return f;};
  const summarize=i=>({id:i.id,key:i.key,summary:i.summary,status:name('Status',i.status),statusId:i.status,statusCategory:category(i.status),type:name('IssueType',i.type),typeId:i.type,typeLevel:lookup('IssueType').get(String(i.type??''))?.hierarchy_level||'0',project:i.project,updated:i.updated,
    ...(portal?{}:{priority:name('Priority',i.priority),assignee:user(i.assignee),reporter:user(i.reporter),created:i.created,due:i.due,resolution:i.resolution?name('Resolution',i.resolution):''})});
  const query=(jql,extra='1',pagination=true)=>{
    const parsed=compileJql(db,jql,access,backup.report.archiveDate);
    const where=`${access.sql(portal)} AND (${parsed.where}) AND (${extra})`;
    const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0)));
    const limit=Math.max(1,Math.min(500,Math.floor(Number(url.searchParams.get('limit'))||50)));
    const total=one(db,`SELECT count(*) n FROM issues i WHERE ${where}`).n;
    const items=all(db,`SELECT i.* FROM issues i WHERE ${where} ORDER BY ${parsed.order}${pagination?' LIMIT ? OFFSET ?':''}`,...(pagination?[limit,offset]:[]));
    return {total,offset,limit,items:items.map(summarize)};
  };
  const issueByKey=key=>{const i=one(db,'SELECT * FROM issues WHERE key=? COLLATE NOCASE OR id=?',key,key)||one(db,"SELECT i.* FROM issues i JOIN records r ON r.kind='MovedIssueKey' AND r.parent=i.id WHERE json_extract(r.data,'$.oldissuekey')=? COLLATE NOCASE",key);if(!i||!access.canIssue(i.id,portal))fail(404,'Vorgang ist nicht verfügbar');return i;};
  const publicComments=i=>rows(db,'Action',i.id).filter(c=>c.type==='comment'&&access.canComment(c,projectById.get(i.project),portal));
  const attachments=i=>{
    let list=rows(db,'FileAttachment',i.id);
    if(portal){const raw=row(db,'Issue',i.id);const bodies=[raw.description,raw.descriptionadf,...publicComments(i).flatMap(c=>[c.body,c.bodyadf])].filter(Boolean).join('\n');
      list=list.filter(a=>bodies.includes(`[^${a.filename}]`)||bodies.includes(`!${a.filename}!`)||bodies.includes(`"id":"${a.id}"`));}
    return list.map(a=>({...a,available:!!one(db,'SELECT 1 FROM files WHERE id=?',a.id)}));
  };
  if(resource==='report'&&!portal) {if(!isAdmin)fail(403,'Importbericht erfordert Administration');return json(res,backup.report);}
  if(resource==='jql'&&!portal)return json(res,{help:JQL_HELP});
  if(resource==='projects'&&!portal) {
    if(id){
      const p=safeProjects.find(p=>p.id===id||p.key===id);if(!p)fail(404,'Projekt ist nicht verfügbar');
      const sub=parts[6];
      const versions=sorted(rows(db,'Version',p.id),'sequence'),components=rows(db,'Component',p.id);
      const projectBoards=rows(db,'Board').filter(b=>b.parent_project_id===p.id);
      const scope=`i.project=${literal(p.id)}`;
      const count=column=>all(db,`SELECT i.${column} value,count(*) count FROM issues i WHERE ${access.sql()} AND ${scope} GROUP BY i.${column}`);
      if(sub==='summary')return json(res,{id:p.id,key:p.key,name:p.name,
        statusCounts:count('status').map(r=>({id:r.value,name:name('Status',r.value),category:category(r.value),count:r.count})).sort((a,b)=>b.count-a.count),
        typeCounts:count('type').map(r=>({id:r.value,name:name('IssueType',r.value),count:r.count})).sort((a,b)=>b.count-a.count),
        assigneeCounts:count('assignee').map(r=>({id:r.value,name:user(r.value),count:r.count})).sort((a,b)=>b.count-a.count).slice(0,8),
        priorityCounts:count('priority').map(r=>({id:r.value,name:name('Priority',r.value),count:r.count})).sort((a,b)=>b.count-a.count),
        recent:all(db,`SELECT i.* FROM issues i WHERE ${access.sql()} AND ${scope} ORDER BY i.updated DESC, i.id LIMIT 10`).map(summarize),
        total:one(db,`SELECT count(*) n FROM issues i WHERE ${access.sql()} AND ${scope}`).n,
        boards:projectBoards,versions:versions.filter(v=>v.archived!=='true')});
      if(sub==='settings')return json(res,{id:p.id,key:p.key,name:p.name,projecttype:p.projecttype,lead:user(p.lead),descriptionHtml:render(p.description),
        workflow:rows(db,'WorkflowSchemeEntity',p.workflowscheme).map(w=>({...w,issuetypeName:w.issuetype?name('IssueType',w.issuetype):'Alle übrigen Vorgangstypen'})),
        roles:rows(db,'ProjectRole').map(r=>({...r,actors:rows(db,'ProjectRoleActor',p.id).filter(a=>a.projectroleid===r.id).map(a=>a.roletype==='atlassian-group-role-actor'?`Gruppe ${a.roletypeparameter}`:user(a.roletypeparameter))})),
        permissions:rows(db,'SchemePermissions',p.permissionscheme),issueSecurity:rows(db,'SchemeIssueSecurityLevels',p.issuesecurityscheme),
        boards:projectBoards.map(b=>({...b,columns:sorted(rows(db,'BoardColumn',b.id),'pos').map(c=>({...c,statuses:boardStatuses(c.id).map(s=>name('Status',s))})),
          sprints:sorted(rows(db,'Sprint',b.id),'sequence'),swimlanes:sorted(rows(db,'Swimlane',b.id),'pos'),quickFilters:sorted(rows(db,'QuickFilter',b.id),'pos'),
          filter:row(db,'SearchRequest',b.saved_filter_id)})),
        queues:rows(db,'Queue').filter(q=>q.project_id===p.id),
        requestTypes:rows(db,'Portal').filter(v=>v.project_id===p.id).flatMap(v=>rows(db,'RequestType',v.id).map(t=>({...t,portal:v.name}))),
        slaGoals:rows(db,'TimeMetric').filter(m=>m.project_id===p.id||!m.project_id).map(m=>({...m,goals:rows(db,'SlaGoal',m.id)}))});
      if(sub==='timeline')return json(res,timeline(p,versions));
      if(sub)fail(404,'Projektansicht nicht gefunden');
      return json(res,{...p,lead:user(p.lead),descriptionHtml:render(p.description),versions,components,boards:projectBoards,
        serviceDesk:rows(db,'ServiceDesk').some(s=>s.project_id===p.id),portals:rows(db,'Portal').filter(v=>v.project_id===p.id).length,
        total:one(db,`SELECT count(*) n FROM issues i WHERE ${access.sql()} AND ${scope}`).n});
    }
    const counts=all(db,`SELECT i.project,count(*) count FROM issues i WHERE ${access.sql()} GROUP BY i.project`);
    return json(res,safeProjects.map(p=>({...p,count:counts.find(c=>c.project===p.id)?.count||0,agent:p.projecttype==='service_desk'})));
  }
  if(resource==='search'||resource==='requests'&&portal&&!id) {
    let jql=url.searchParams.get('jql')||'';
    if(!portal&&url.searchParams.has('filter'))jql=filterById(url.searchParams.get('filter')).request;
    if(portal&&jql)fail(400,'Das Portal unterstützt ausschließlich seine öffentlichen Suchfilter');
    const extra=[];
    for(const key of ['project','status','type']) if(url.searchParams.get(key))extra.push(`i.${key}=${literal(url.searchParams.get(key))}`);
    const q=url.searchParams.get('q')||'';if(q.length>250)fail(400,'Suchbegriff ist zu lang');
    if(q)extra.push(`(instr(lower(i.summary),lower(${literal(q)}))>0 OR instr(lower(i.key),lower(${literal(q)}))>0${portal?'':` OR instr(lower(i.description),lower(${literal(q)}))>0`})`);
    return json(res,query(jql,extra.join(' AND ')||'1'));
  }
  if(resource==='issues'&&!portal || resource==='requests'&&portal&&id) {
    const i=issueByKey(id),data=row(db,'Issue',i.id),p=projectById.get(i.project);
    const comments=publicComments(i).map(c=>({id:c.id,author:user(c.author),created:c.created,html:render(c.bodyadf||c.body),public:access.canComment(c,p,true)}));
    const request=rows(db,'IssueRequestType',i.id)[0];
    const viewport=request&&rows(db,'Portal').find(v=>v.project_id===p.id&&v.key===request.portal_key);
    const requestType=viewport&&rows(db,'RequestType',viewport.id).find(t=>t.key===request.request_type_key);
    const values=all(db,'SELECT field,value FROM custom_values WHERE issue=?',i.id);
    const fields=customField().filter(f=>values.some(v=>v.field===f.id)).map(f=>typedField(f,values.filter(v=>v.field===f.id).map(v=>v.value)));
    const result={...summarize(i),descriptionHtml:render(data.descriptionadf||data.description),comments,attachments:attachments(i),requestType:requestType&&{id:requestType.id,name:requestType.name},projectName:p.name,projectKey:p.key,archiveDate:backup.report.archiveDate,readOnly:true,originalUrl:originalIssueUrl(backup.siteUrl,i.key),originalSite:backup.siteUrl||null};
    if(portal){
      const visibleFields=new Set(requestType?rows(db,'RequestField',requestType.id).filter(f=>f.displayed==='true').map(f=>f.field_id):[]);
      result.fields=fields.filter(f=>visibleFields.has(`customfield_${f.id}`)&&!f.customfieldtypekey?.includes('sd-')).map(f=>({id:f.id,name:f.name,type:f.type,values:f.values}));
      return json(res,result);
    }
    const history=rows(db,'ChangeGroup',i.id).map(g=>({id:g.id,author:user(g.author),created:g.created,items:rows(db,'ChangeItem',g.id).filter(c=>!['comment','worklog'].includes(c.field?.toLowerCase()))}));
    const linked=all(db,"SELECT data FROM records WHERE kind='IssueLink' AND (parent=? OR json_extract(data,'$.destination')=?)",i.id,i.id).map(r=>JSON.parse(r.data)).flatMap(l=>{const target=l.source===i.id?l.destination:l.source;if(!access.canIssue(target))return [];const type=row(db,'IssueLinkType',l.linktype);const relationship=(l.source===i.id?type?.outward:type?.inward)||'Verknüpft';if(String(relationship).toLowerCase()==='jira_subtask_outward')return [];return [{...summarize(one(db,'SELECT * FROM issues WHERE id=?',target)),relationship}];});
    const parent=rows(db,'IssueParentAssociation',i.id)[0]?.parentid || (data.effectivesubtaskparentid!==i.id?data.effectivesubtaskparentid:null);
    const childIds=all(db,"SELECT parent FROM records WHERE kind='IssueParentAssociation' AND json_extract(data,'$.parentid')=?",i.id).map(r=>r.parent);
    return json(res,{...result,fields,history,links:linked,parent:parent&&access.canIssue(parent)?summarize(one(db,'SELECT * FROM issues WHERE id=?',parent)):null,
      children:childIds.filter(c=>access.canIssue(c)).map(c=>summarize(one(db,'SELECT * FROM issues WHERE id=?',c))),
      worklogs:rows(db,'Worklog',i.id).filter(w=>access.canComment(w,p)).map(w=>({...w,author:user(w.author),html:render(w.bodyadf||w.body)})),
      versions:rows(db,'FixVersion',i.id).map(v=>row(db,'Version',v.version)||{id:v.version,name:'Version nicht im Export enthalten'}),components:rows(db,'IssueComponent',i.id).map(c=>row(db,'Component',c.component)||{id:c.component,name:'Komponente fehlt'}),
      labels:rows(db,'Label',i.id).map(l=>l.label),sla:rows(db,'Sla',i.id).map(s=>({...s,name:row(db,'TimeMetric',s.time_metric_id)?.name||s.custom_field_id})),
      participants:fields.filter(f=>f.customfieldtypekey==='com.atlassian.servicedesk:sd-request-participants').flatMap(f=>f.values.map(v=>v.text)),organizations:fields.filter(f=>f.customfieldtypekey==='com.atlassian.servicedesk:sd-customer-organizations').flatMap(f=>f.values.map(v=>v.text)),
      points:fields.find(f=>f.id===special().points)?.values[0]?.text||null,
      time:{spent:data.timespent,remaining:data.timeestimate,original:data.timeoriginalestimate},environmentHtml:render(data.environmentadf||data.environment),remoteLinks:rows(db,'RemoteIssueLink',i.id).map(l=>({id:l.id,html:render(`[${l.title}|${l.url}]`)}))});
  }
  if(resource==='attachments') {
    const attachment=row(db,'FileAttachment',id);if(!attachment)fail(404,'Anhang nicht verfügbar');
    const i=issueByKey(attachment.issue);if(!attachments(i).some(a=>a.id===id))fail(404,'Anhang nicht verfügbar');
    const file=one(db,'SELECT * FROM files WHERE id=?',id);if(!file)fail(404,'Anhangdatei fehlt im Archiv');
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.size,'Content-Disposition':`attachment; filename="${attachment.filename.replace(/[^\x20-\x7e]|["\\]/g,'_')}"`,'Content-Security-Policy':"default-src 'none'; sandbox"});
    return pipeline(await backup.archive.stream(file.entry),res);
  }
  if(resource==='filters'&&!portal)return json(res,rows(db,'SearchRequest').filter(f=>canShare('SearchRequest',f.id,f.author||f.user)).map(f=>{try{compileJql(db,f.request,access,backup.report.archiveDate);return f;}catch(e){return {...f,unavailable:e.message};}}));
  if(resource==='boards'&&!portal) {
    const boards=rows(db,'Board').filter(b=>projectIds.has(b.parent_project_id));
    if(!id)return json(res,boards.map(b=>({...b,project:projectById.get(b.parent_project_id)?.name,projectKey:projectById.get(b.parent_project_id)?.key,sprints:rows(db,'Sprint',b.id).length})));
    const board=boards.find(b=>b.id===id);if(!board)fail(404,'Board ist nicht verfügbar');
    const columns=sorted(rows(db,'BoardColumn',id),'pos').map(c=>({...c,statuses:rows(db,'ColumnStatus').filter(s=>s.column_id===c.id).map(s=>s.status_id)}));
    const sprints=rows(db,'Sprint',id),quickFilters=sorted(rows(db,'QuickFilter',id),'pos');
    let result,unavailable;
    try {
      const saved=filterById(board.saved_filter_id),sub=rows(db,'BoardSubquery',id).filter(q=>q.query||q.long_query);
      const filter=compileJql(db,saved.request,access,backup.report.archiveDate);
      const conditions=[filter.where,...sub.map(s=>compileJql(db,s.long_query||s.query,access,backup.report.archiveDate).where)];
      if(url.searchParams.has('quick')){const q=quickFilters.find(q=>q.id===url.searchParams.get('quick'));if(!q)fail(404,'Schnellfilter nicht verfügbar');conditions.push(compileJql(db,q.long_query||q.query,access,backup.report.archiveDate).where);}
      const sprint=url.searchParams.get('sprint');
      if(sprint){if(!sprints.some(s=>s.id===sprint))fail(404,'Sprint nicht verfügbar');conditions.push(`EXISTS(SELECT 1 FROM records s WHERE s.kind='IssueSprint' AND s.parent=i.id AND json_extract(s.data,'$.sprint_id')=${literal(sprint)})`);}
      result=query(saved.request,conditions.join(' AND '));
      const points=special().points;
      result.items=result.items.map(i=>({...i,parentKey:parentKey(i.id),sprintIds:rows(db,'IssueSprint',i.id).map(s=>s.sprint_id),
        points:points?fieldText(points,i.id)||null:null}));
    }catch(e){if(e.status!==422&&e.status!==404)throw e;unavailable=e.message;}
    return json(res,{...board,project:projectById.get(board.parent_project_id)?.name,columns,sprints,quickFilters,swimlanes:sorted(rows(db,'Swimlane',id),'pos'),...result,unavailable});
  }
  if(resource==='service-desks'&&!portal)return json(res,rows(db,'ServiceDesk').filter(s=>projectIds.has(s.project_id)).map(s=>({...s,name:projectById.get(s.project_id)?.name})));
  if(resource==='queues'&&!portal) {
    const queues=rows(db,'Queue').filter(q=>projectIds.has(q.project_id));
    if(!id)return json(res,queues);
    const q=queues.find(q=>q.id===id);if(!q)fail(404,'Warteschlange ist nicht verfügbar');
    const columns=sorted(rows(db,'QueueColumn',q.id),'column_order').map(c=>({...c,name:row(db,'CustomField',(c.column_id||'').replace('customfield_',''))?.name}));
    try{const result=query(q.jql,`i.project=${literal(q.project_id)}`);return json(res,{...q,columns,...result,items:result.items.map(i=>({...i,columnValues:Object.fromEntries(columns.map(c=>{const cf=/^customfield_(\d+)$/.exec(c.column_id);return [c.column_id,cf?fieldText(cf[1],i.id):undefined];}))}))});}catch(e){if(e.status!==422)throw e;return json(res,{...q,columns,unavailable:e.message});}
  }
  if(resource==='portals'||resource==='request-types') {
    const portals=rows(db,'Portal').filter(v=>projectIds.has(v.project_id) && (!portal||v.hide_portal!=='true'));
    if(resource==='portals'&&!id)return json(res,portals);
    if(resource==='portals'){
      const v=portals.find(v=>v.id===id);if(!v)fail(404,'Portal ist nicht verfügbar');
      return json(res,{...v,descriptionHtml:render(v.description),groups:sorted(rows(db,'PortalGroup',id).filter(g=>!g.deleted_time),'order').map(g=>({...g,types:rows(db,'PortalGroupType',g.id).map(t=>t.request_type_id)})),types:sorted(rows(db,'RequestType',id),'form_order')});
    }
    const types=portals.flatMap(v=>rows(db,'RequestType',v.id));
    if(!id)return json(res,types);
    const t=types.find(t=>t.id===id);if(!t)fail(404,'Anfragetyp ist nicht verfügbar');
    return json(res,{...t,descriptionHtml:render(t.description),introHtml:render(t.intro),fields:sorted(rows(db,'RequestField',id).filter(f=>!portal||f.displayed==='true'),'field_order').map(f=>({...f,values:rows(db,'RequestFieldValue',f.id)}))});
  }
  if(resource==='customers'&&!portal) {
    const visible=all(db,`SELECT DISTINCT i.reporter FROM issues i WHERE ${access.sql()}`).map(i=>i.reporter);
    const orgIds=new Set();
    for(const p of safeProjects)for(const o of rows(db,'OrganizationProject',p.id))orgIds.add(o.organization_id);
    for(const f of rows(db,'CustomField').filter(f=>f.customfieldtypekey==='com.atlassian.servicedesk:sd-customer-organizations'))for(const o of all(db,`SELECT DISTINCT cv.value FROM custom_values cv JOIN issues i ON i.id=cv.issue WHERE cv.field=? AND ${access.sql()}`,f.id))orgIds.add(o.value);
    return json(res,{customers:visible.filter(Boolean).map(id=>({id,name:user(id)})),organizations:rows(db,'Organization').filter(o=>orgIds.has(o.id)).map(o=>({...o,members:rows(db,'OrganizationMember',o.id).filter(m=>m.is_deleted!=='true').map(m=>user(m.user_key))}))});
  }
  if(resource==='dashboards'&&!portal) {
    const dashboards=rows(db,'PortalPage').filter(d=>canShare('PortalPage',d.id,d.username));
    if(!id)return json(res,dashboards);
    const d=dashboards.find(d=>d.id===id);if(!d)fail(404,'Dashboard ist nicht verfügbar');
    return json(res,{...d,gadgets:rows(db,'PortletConfiguration',id).map(g=>{const prefs=Object.fromEntries(rows(db,'GadgetUserPreference',g.id).map(p=>[p.userprefkey,p.userprefvalue]));
      try{if(!/filter-results|filterresults/i.test(g.gadgetxml||''))throw new Error('Dieses Gadget benötigt eine Laufzeit oder Kennzahlen, die nicht im Backup enthalten sind.');
        const f=filterById((prefs.filterId||'').replace('filter-',''));return {...g,title:f.name,result:query(f.request)};
      }catch(e){return {...g,unavailable:e.message};}})});
  }
  if(resource==='reports'&&!portal) {
    const desks=rows(db,'ServiceDesk').filter(s=>projectIds.has(s.project_id));
    const reports=desks.flatMap(s=>rows(db,'ServiceReport',s.id));
    const statusCounts=all(db,`SELECT i.status,count(*) count FROM issues i WHERE ${access.sql()} GROUP BY i.status`).map(s=>({name:name('Status',s.status),count:s.count}));
    if(!id)return json(res,{statusCounts,reports,notice:'Bestandszahlen zum Archivstand. Historische Zeitreihen und Integrationskennzahlen sind nicht exportiert.'});
    const report=reports.find(r=>r.id===id);if(!report)fail(404,'Bericht ist nicht verfügbar');
    const desk=desks.find(s=>s.id===report.service_desk_id);
    return json(res,{...report,series:rows(db,'ReportSeries',id).map(s=>{try{return {...s,snapshotCount:query(s.jql||'',`i.project=${literal(desk.project_id)}`).total,notice:'Aktueller Archivbestand für den exportierten Filter; keine historische Zeitreihe.'};}catch(e){if(e.status!==422)throw e;return {...s,unavailable:e.message};}})});
  }
  if(resource==='configuration'&&!portal)return json(res,{projects:safeProjects.map(p=>({id:p.id,name:p.name,key:p.key,projecttype:p.projecttype})),notice:'Workflows, Rollen, Berechtigungsschemata und Board-Konfiguration stehen in den Projekteinstellungen des jeweiligen Projekts. Assets, Apps und Integrationen benötigen externe Daten und sind aus diesem Export nicht rekonstruierbar.'});
  fail(404,'Jira-Schnittstelle nicht gefunden');
}
