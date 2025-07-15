import {escapeHtml} from '../server/jira-render.mjs';
const entity=(kind,data)=>`<j:${kind} ${Object.entries(data).map(([k,v])=>`${k}="${escapeHtml(v)}"`).join(' ')}/>`;
const table=(name,records)=>{const columns=[...new Set(records.flatMap(Object.keys))];return `<data tableName="${name}">${columns.map(c=>`<column name="${c}"/>`).join('')}${records.map(r=>`<row>${columns.map(c=>r[c]==null?'<string xsi:nil="true"/>':`<string>${escapeHtml(r[c])}</string>`).join('')}</row>`).join('')}</data>`;};
export function jiraFixture({changed=false}={}) {
  const entities=[];
  const add=(kind,...rs)=>entities.push(...rs.map(r=>entity(kind,r)));
  add('Project',{id:'p',key:'HELP',name:'Service-Team',projecttype:'service_desk',permissionscheme:'s',issuesecurityscheme:'sec',workflowscheme:'w'},
    {id:'software',key:'DEV',name:'Entwicklung',projecttype:'software',permissionscheme:'s'},
    {id:'closed',key:'LOCK',name:'Vertrauliches Projekt',permissionscheme:'unknown'},
    {id:'absent',key:'ABSENT',name:'Kein Schema'});
  for(const [id,ext,name] of [['agent','central-agent','Agentin'],['customer','central-customer','Kundin'],['other','central-other','Andere Kundin'],['unmapped','different-id','Kundin']]){
    add('User',{id,externalId:ext,userName:`jira-${id}`,lowerUserName:`jira-${id}`,displayName:name,active:'1',credential:'EXPORTED-PASSWORD-DO-NOT-STORE'});
    add('ApplicationUser',{id,userKey:id,lowerUserName:`jira-${id}`});
  }
  add('Group',{id:'g',groupName:'agents',active:'1',externalId:'group-agents'});
  add('Membership',{id:'m',membershipType:'GROUP_USER',parentId:'g',parentName:'agents',childId:'agent'});
  add('ProjectRole',{id:'agent-role',name:'Service Desk Team'});
  add('ProjectRoleActor',{id:'ra',pid:'p',projectroleid:'agent-role',roletype:'atlassian-group-role-actor',roletypeparameter:'agents'});
  add('SchemePermissions',{id:'browse',scheme:'s',permissionKey:'BROWSE_PROJECTS',type:'group',parameter:'agents'},
    {id:'portal',scheme:'s',permissionKey:'BROWSE_PROJECTS',type:'sd.customer.portal.only'},
    {id:'agent',scheme:'s',permissionKey:'SERVICEDESK_AGENT',type:'projectrole',parameter:'agent-role'},
    {id:'unknown',scheme:'unknown',permissionKey:'BROWSE_PROJECTS',type:'future-rule'});
  add('SchemeIssueSecurityLevels',{id:'private',scheme:'sec',name:'Privat'});
  add('SchemeIssueSecurities',{id:'sec1',scheme:'sec',security:'private',type:'reporter'}, {id:'sec2',scheme:'sec',security:'private',type:'group',parameter:'agents'});
  add('IssueType',{id:'task',name:'Service Request',hierarchy_level:'0'},{id:'epic',name:'Epic',hierarchy_level:'1'},{id:'bug',name:'Fehler',hierarchy_level:'0'},{id:'sub',name:'Unteraufgabe',hierarchy_level:'-1'});
  add('Status',{id:'open',name:'Offen',statuscategory:'2'},{id:'progress',name:'In Arbeit',statuscategory:'4'},{id:'done',name:'Erledigt',statuscategory:'3'});
  add('Priority',{id:'high',name:'Hoch'});
  for(let n=1;n<=60;n++)add('Issue',{id:String(n),project:'p',projectKey:'HELP',number:n,summary:n===1?(changed?'Geänderte Anfrage':'Laptop startet nicht'):`Archivierte Anfrage ${n}`,description:'h2. Fehlerbild\nBitte prüfen. [^missing.txt]',status:'open',type:'task',priority:'high',reporter:n===1?'customer':'other',assignee:'agent',created:'2026-09-01 10:00:00',updated:'2026-09-10 10:00:00',security:n===2?'private':''});
  add('Issue',{id:'61',project:'p',projectKey:'HELP',number:'61',summary:'Unbekannte Sicherheitsregel',reporter:'customer',security:'unknown'},
    {id:'62',project:'closed',projectKey:'LOCK',number:'1',summary:'Geheimer Suchtreffer'},
    {id:'63',project:'absent',projectKey:'ABSENT',number:'1',summary:'Ohne Berechtigungsschema'},
    {id:'64',project:'software',projectKey:'DEV',number:'1',summary:'Entwicklungsaufgabe',status:'open',type:'task'});
  add('Action',{id:'public',issue:'1',author:'agent',type:'comment',body:'Öffentliche Antwort',commentVisibility:'VISIBLE_TO_HELPSEEKER'},
    {id:'internal',issue:'1',author:'agent',type:'comment',body:'INTERNE-NOTIZ',commentVisibility:'INTERNAL'},
    {id:'restricted',issue:'1',author:'agent',type:'comment',body:'GRUPPENGEHEIM',level:'private-group',commentVisibility:'NONE'},
    {id:'unknown-comment',issue:'1',type:'comment',body:'UNBEKANNTE-SICHTBARKEIT',commentVisibility:'FUTURE'},
    {id:'legacy-public',issue:'1',type:'comment',body:'Legacy öffentlich',commentVisibility:'NONE'});
  add('EntityProperty',{id:'ep',entityName:'CommentProperty',entityId:'legacy-public',propertyKey:'sd.public.comment',value:'{"internal":false}'},
    {id:'technical',entityName:'IssueInternalProperty',entityId:'1',propertyKey:'secret-api-token',value:'EXPORTED-TECHNICAL-TOKEN'});
  add('MailServer',{id:'mail',password:'EXPORTED-MAIL-PASSWORD'});
  add('Issue',{id:'70',project:'software',projectKey:'DEV',number:'2',summary:'Zahlungsabwicklung',type:'epic',status:'progress',priority:'high',assignee:'agent',reporter:'agent',duedate:'2026-10-31 00:00:00',created:'2026-09-01 10:00:00',updated:'2026-09-05 10:00:00'},
    {id:'71',project:'software',projectKey:'DEV',number:'3',summary:'Zahlungsanbieter anbinden',type:'task',status:'progress',priority:'high',assignee:'agent',reporter:'agent',duedate:'2026-09-20 00:00:00',created:'2026-09-01 10:00:00',updated:'2026-09-06 10:00:00'},
    {id:'72',project:'software',projectKey:'DEV',number:'4',summary:'Rundungsfehler im Warenkorb',type:'bug',status:'done',priority:'high',assignee:'other',reporter:'agent',duedate:'2026-10-10 00:00:00',created:'2026-09-01 10:00:00',updated:'2026-09-07 10:00:00'},
    {id:'73',project:'software',projectKey:'DEV',number:'5',summary:'Epic ohne Zeitraum',type:'epic',status:'open',priority:'high',assignee:'agent',reporter:'agent',created:'2026-09-01 10:00:00',updated:'2026-09-08 10:00:00'});
  add('IssueParentAssociation',{issueid:'71',parentid:'70'},{issueid:'72',parentid:'70'});
  add('CustomField',{id:'200',name:'Startdatum',customfieldtypekey:'com.atlassian.jira.plugin.system.customfieldtypes:datepicker'},
    {id:'201',name:'Story Points',customfieldtypekey:'com.atlassian.jira.plugin.system.customfieldtypes:float'},
    {id:'202',name:'Kategorie',customfieldtypekey:'com.atlassian.jira.plugin.system.customfieldtypes:select'},
    {id:'203',name:'Ansprechpartner',customfieldtypekey:'com.atlassian.jira.plugin.system.customfieldtypes:userpicker'},
    {id:'204',name:'Notizen',customfieldtypekey:'com.atlassian.jira.plugin.system.customfieldtypes:textarea'},
    {id:'participants',name:'Teilnehmer',customfieldtypekey:'com.atlassian.servicedesk:sd-request-participants'},
    {id:'orgs',name:'Organisationen',customfieldtypekey:'com.atlassian.servicedesk:sd-customer-organizations'},
    {id:'101',name:'Öffentliches Formularfeld',customfieldtypekey:'text'}, {id:'102',name:'Agentenfeld',customfieldtypekey:'text'});
  add('CustomFieldOption',{id:'opt-hardware',customfield:'202',value:'Hardware',sequence:'0'},{id:'opt-software',customfield:'202',value:'Software',sequence:'1'});
  add('CustomFieldValue',{id:'part',issue:'3',customfield:'participants',stringvalue:'customer'},
    {id:'org',issue:'4',customfield:'orgs',stringvalue:'org1'},
    {id:'shown',issue:'1',customfield:'101',stringvalue:'Kundenwert'},
    {id:'hidden',issue:'1',customfield:'102',stringvalue:'AGENTENFELD-GEHEIM'},
    {id:'cat',issue:'1',customfield:'202',stringvalue:'opt-hardware'},
    {id:'contact',issue:'1',customfield:'203',stringvalue:'agent'},
    {id:'notes',issue:'1',customfield:'204',textvalue:'h3. Hinweis\nBitte *zügig* prüfen.'},
    {id:'start70',issue:'70',customfield:'200',datevalue:'2026-09-01 00:00:00'},
    {id:'start71',issue:'71',customfield:'200',datevalue:'2026-09-05 00:00:00'},
    {id:'start72',issue:'72',customfield:'200',datevalue:'2026-09-25 00:00:00'},
    {id:'points71',issue:'71',customfield:'201',numbervalue:'5'});
  add('FileAttachment',{id:'file',issue:'1',filename:'missing.txt',filesize:'12'}, {id:'private-file',issue:'2',filename:'private.txt',filesize:'12'});
  add('ChangeGroup',{id:'ch',issue:'1',author:'agent',created:'2026-09-10 10:00:00'});add('ChangeItem',{id:'ci',group:'ch',field:'status',oldstring:'Neu',newstring:'Offen'});
  add('Worklog',{id:'wl',issue:'1',author:'agent',body:'Diagnose',timeworked:'60'});
  add('IssueLinkType',{id:'rel',outward:'bezieht sich auf',inward:'bezieht sich auf'});add('IssueLink',{id:'link',source:'1',destination:'62',linktype:'rel'});
  add('Version',{id:'v1',project:'p',name:'1.0'});
  add('Version',{id:'v2',project:'software',name:'2.0',description:'Zahlungsrelease',startdate:'2026-09-01 00:00:00',releasedate:'2026-10-15 00:00:00',released:'false',sequence:'1'});add('FixVersion',{issue:'1',version:'v1'});add('Component',{id:'comp',project:'p',name:'Support'});add('IssueComponent',{issue:'1',component:'comp'});
  add('SearchRequest',{id:'filter',name:'Support-Filter',author:'agent',request:'project = HELP ORDER BY key ASC'},
    {id:'bad-filter',name:'Nicht unterstützter Filter',author:'agent',request:'issue in unknownFunction()'},
    {id:'dev-filter',name:'Entwicklungs-Filter',author:'agent',request:'project = DEV ORDER BY key ASC'});
  add('SharePermissions',{id:'share',entityId:'filter',entityType:'SearchRequest',type:'group',param1:'agents'},
    {id:'devshare',entityId:'dev-filter',entityType:'SearchRequest',type:'group',param1:'agents'}, {id:'dashshare',entityId:'dash',entityType:'PortalPage',type:'global'});
  add('PortalPage',{id:'dash',pagename:'Team-Dashboard'});add('PortletConfiguration',{id:'gadget',portalpage:'dash',gadgetXml:'external-gadget'});
  add('WorkflowSchemeEntity',{id:'wf',scheme:'w',workflow:'Support Workflow',issuetype:'task'});
  const ao=[];const a=(name,...rs)=>ao.push(table(name,rs));
  a('AO_54307E_SERVICEDESK',{ID:'desk',PROJECT_ID:'p'});
  a('AO_54307E_QUEUE',{ID:'queue',PROJECT_ID:'p',NAME:'Offene Anfragen',JQL:'resolution IS EMPTY ORDER BY key ASC'}, {ID:'bad-queue',PROJECT_ID:'p',NAME:'Externe Assets',JQL:'Region in iqlFunction("Name = AMER")'});
  a('AO_54307E_QUEUECOLUMN',{ID:'qc1',QUEUE_ID:'queue',COLUMN_ID:'key',COLUMN_ORDER:'0'},{ID:'qc2',QUEUE_ID:'queue',COLUMN_ID:'summary',COLUMN_ORDER:'1'});
  a('AO_54307E_VIEWPORT',{ID:'portal',PROJECT_ID:'p',KEY:'help',NAME:'IT-Hilfe',DESCRIPTION:'Hilfe für Mitarbeitende',HIDE_PORTAL:'false'});
  a('AO_54307E_VIEWPORTFORM',{ID:'request',VIEWPORT_ID:'portal',KEY:'help-request',NAME:'IT-Unterstützung',DESCRIPTION:'Beschreibe dein Anliegen',ISSUE_TYPE_ID:'task'});
  a('AO_54307E_VIEWPORTFIELD',{ID:'field',FORM_ID:'request',FIELD_ID:'customfield_101',LABEL:'Öffentliches Formularfeld',DISPLAYED:'true',REQUIRED:'true'}, {ID:'hidden-field',FORM_ID:'request',FIELD_ID:'customfield_102',LABEL:'Agentenfeld',DISPLAYED:'false'});
  a('AO_54307E_REQUESTTYPE_TO_ISSUE',...[1,2,3,4,5,61].map(n=>({ID:`rt${n}`,ISSUE_ID:String(n),PORTAL_KEY:'help',REQUEST_TYPE_KEY:'help-request'})));
  a('AO_54307E_GROUP',{ID:'category',VIEWPORT_ID:'portal',GROUP_NAME:'Technische Hilfe'});a('AO_54307E_GROUPTOREQUESTTYPE',{ID:'category-type',GROUP_ID:'category',REQUEST_TYPE_ID:'request'});
  a('AO_54307E_ORGANIZATION',{ID:'org1',NAME:'Kundenorganisation'});a('AO_54307E_ORGANIZATION_MEMBER',{ID:'member',ORGANIZATION_ID:'org1',USER_KEY:'customer',IS_DELETED:'false'});
  a('AO_54307E_TIMEMETRIC',{ID:'sla',NAME:'Erste Antwort',SERVICE_DESK_ID:'desk'});a('AO_54307E_SLASEARCHINDEX',{ID:'sla1',ISSUE_ID:'1',TIME_METRIC_ID:'sla',LAST_CYCLE_STATE:'completed',TIMELINE:'{"events":[]}'});
  a('AO_54307E_REPORT',{ID:'report1',SERVICE_DESK_ID:'desk',NAME:'Anfragebericht'});a('AO_54307E_SERIES',{ID:'series',REPORT_ID:'report1',SERIES_LABEL:'Offene Anfragen',JQL:'resolution IS EMPTY'});
  a('AO_60DB71_RAPIDVIEW',{ID:'board',NAME:'Support-Board',PARENT_PROJECT_ID:'p',SAVED_FILTER_ID:'filter'});
  a('AO_60DB71_COLUMN',{ID:'column',RAPID_VIEW_ID:'board',NAME:'Zu erledigen',POS:'0'});a('AO_60DB71_COLUMNSTATUS',{ID:'column-status',COLUMN_ID:'column',STATUS_ID:'open'});
  a('AO_60DB71_SPRINT',{ID:'sprint',RAPID_VIEW_ID:'board',NAME:'Sprint September',STARTED:'true',CLOSED:'false',START_DATE:'1788220800000',END_DATE:'1789430400000',SEQUENCE:'1'});a('ISSUESPRINT_60DB71',{ISSUE_ID:'1',SPRINT_ID:'sprint'});
  a('AO_60DB71_SWIMLANE',{ID:'lane',RAPID_VIEW_ID:'board',NAME:'Dringend',QUERY:'priority = Hoch',POS:'0'});
  a('AO_60DB71_QUICKFILTER',{ID:'quick',RAPID_VIEW_ID:'board',NAME:'Nur offene',QUERY:'resolution IS EMPTY',POS:'0'});
  a('AO_60DB71_LEXORANK',{ID:'r1',ISSUE_ID:'71',RANK:'0|hzzzzz:',TYPE:'1'},{ID:'r2',ISSUE_ID:'72',RANK:'0|i00000:',TYPE:'1'});
  a('AO_60DB71_RAPIDVIEW',{ID:'dev-board',NAME:'Entwicklungs-Board',PARENT_PROJECT_ID:'software',SAVED_FILTER_ID:'dev-filter',SPRINTS_ENABLED:'true'});
  a('AO_60DB71_COLUMN',{ID:'dev-todo',RAPID_VIEW_ID:'dev-board',NAME:'Zu erledigen',POS:'0'},{ID:'dev-doing',RAPID_VIEW_ID:'dev-board',NAME:'In Arbeit',POS:'1',MAXIM:'1'},{ID:'dev-done',RAPID_VIEW_ID:'dev-board',NAME:'Erledigt',POS:'2'});
  a('AO_60DB71_COLUMNSTATUS',{ID:'cs-todo',COLUMN_ID:'dev-todo',STATUS_ID:'open'},{ID:'cs-doing',COLUMN_ID:'dev-doing',STATUS_ID:'progress'},{ID:'cs-done',COLUMN_ID:'dev-done',STATUS_ID:'done'});
  a('AO_60DB71_SPRINT',{ID:'dev-sprint',RAPID_VIEW_ID:'dev-board',NAME:'Sprint 12',GOAL:'Zahlungen ausliefern',STARTED:'true',CLOSED:'false',START_DATE:'1788220800000',END_DATE:'1789430400000',SEQUENCE:'1'});
  a('ISSUESPRINT_60DB71',{ISSUE_ID:'71',SPRINT_ID:'dev-sprint'});
  return {'entities.xml':`<?xml version="1.0"?><j:entity-engine-xml xmlns:j="urn:jira" date="2026-09-10 12:00:00">${entities.join('')}<j:Action id="cdata" issue="1" type="comment" commentVisibility="NONE"><j:body><![CDATA[Unicode Grüße <script>alert(1)</script>]]></j:body></j:Action></j:entity-engine-xml>`,
    'activeobjects.xml':`<?xml version="1.0"?><backup xmlns="http://www.atlassian.com/ao" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${ao.join('')}</backup>`};
}
