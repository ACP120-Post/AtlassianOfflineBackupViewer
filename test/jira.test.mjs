import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {Readable} from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import {zipBytes} from './fixture.mjs';
import {jiraFixture} from './jira-fixture.mjs';
import {loadBackups} from '../server/import.mjs';
import {parseJiraXml,rows} from '../server/jira-import.mjs';
import {jiraAccess} from '../server/jira-permissions.mjs';
import {compileJql} from '../server/jira-jql.mjs';
import {renderJira} from '../server/jira-render.mjs';
import {jiraApi} from '../server/jira-api.mjs';
import {initPlatform,productAccess,assertProduct} from '../server/platform.mjs';
import {openIdentityDb,importIdentityRows} from '../server/identity.mjs';
import {originalIssueUrl} from '../server/original-links.mjs';

test('Original Jira link uses the verified instance origin and issue key',()=>{
  assert.equal(originalIssueUrl('https://se-enterprise-demo.atlassian.net','PLAT-12680'),'https://se-enterprise-demo.atlassian.net/browse/PLAT-12680');
  assert.equal(originalIssueUrl('https://user:secret@example.atlassian.net','PLAT-1'),null);
});

test('Striktes Streaming-XML: Namensräume, CDATA, UTF-8, fehlerhaftes XML und DTD',async()=>{
  const result=[];const xml='<j:entity-engine-xml xmlns:j="test"><j:Issue id="9007199254740993"><j:description><![CDATA[Grüße <b>]]></j:description></j:Issue></j:entity-engine-xml>';
  await parseJiraXml(Readable.from([...Buffer.from(xml)].map(b=>Buffer.from([b]))),false,(k,r)=>result.push([k,r]));
  assert.deepEqual(result,[['Issue',{id:'9007199254740993',description:'Grüße <b>'}]]);
  for(const bad of ['<entity-engine-xml><Issue></entity-engine-xml>','<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><entity-engine-xml/>','<entity-engine-xml><Issue a="1" a="2"/></entity-engine-xml>'])await assert.rejects(()=>parseJiraXml(Readable.from([bad]),false,()=>{}));
});
test('Jira: Import, cache, identities, deny-by-default, JQL, portal projection and all product views',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'jira-test-'));const options={rootDir:dir,backupDir:dir,cacheDir:path.join(dir,'cache'),includeRoot:false};
  let backups,identityDb;const close=()=>{for(const b of backups?.values()||[]){b.db?.close();b.archive?.close();}};
  try {
    await writeFile(path.join(dir,'jira.zip'),zipBytes(jiraFixture()));backups=await loadBackups(options);const b=[...backups.values()][0];assert.equal(b.error,undefined);assert.equal(b.product,'jira');assert.equal(b.report.counts.issues,68);assert.equal(b.report.counts.boards,2);assert.equal(b.report.counts.files,0);
    const stored=await readFile(path.join(options.cacheDir,b.id+'.sqlite'));for(const secret of ['EXPORTED-PASSWORD','EXPORTED-MAIL-PASSWORD','EXPORTED-TECHNICAL-TOKEN'])assert.equal(stored.includes(Buffer.from(secret)),false);
    identityDb=openIdentityDb(options.cacheDir);initPlatform(identityDb);importIdentityRows(identityDb,[{external_id:'central-agent'},{external_id:'central-customer'},{external_id:'unmapped-central',display_name:'Kundin'}]);
    importIdentityRows(identityDb,[{external_id:'central-agent'}],{replace:false});assert.equal(identityDb.prepare("SELECT active FROM identities WHERE external_id='central-customer'").get().active,1);
    const agent={externalId:'central-agent',groups:[]},customer={externalId:'central-customer',groups:[]};
    const a=jiraAccess(b,agent,identityDb),c=jiraAccess(b,customer,identityDb);
    assert.equal(a.canIssue('1'),true);assert.equal(a.canIssue('2'),true);for(const id of ['61','62','63'])assert.equal(a.canIssue(id),false,id);
    assert.equal(c.canIssue('1'),false);for(const id of ['1','3','4'])assert.equal(c.canIssue(id,true),true,id);for(const id of ['2','5','61','62','63','64'])assert.equal(c.canIssue(id,true),false,id);
    assert.equal(jiraAccess(b,{externalId:'unmapped-central',groups:['agents']},identityDb).keys.size,0);
    identityDb.prepare('INSERT INTO jira_identity_mappings VALUES(?,?,?)').run(b.id,'customer','unmapped-central');assert.equal(jiraAccess(b,{externalId:'unmapped-central',groups:[]},identityDb).canIssue('1',true),true);assert.equal(jiraAccess(b,customer,identityDb).canIssue('1',true),false);
    identityDb.prepare('DELETE FROM jira_identity_mappings').run();
    const api=async(path,user=agent)=>{const url=new URL(`/api/backups/${b.id}/jira/${path}`,'http://localhost');return jiraApi({req:{},res:{},url,parts:url.pathname.split('/').filter(Boolean),backup:b,identity:user,identityDb,isAdmin:true,json:(_,data)=>data});};
    const search=await api('search?jql=project%20%3D%20HELP');assert.equal(search.total,60);assert.equal(search.items.length,50);assert.equal((await api('search?offset=50')).items.length,15);
    const portal=await api('portal/requests',customer);assert.equal(portal.total,3);
    const detail=await api('issues/HELP-1');assert.ok(detail.comments.some(c=>c.html.includes('INTERNE-NOTIZ')));assert.ok(!JSON.stringify(detail).includes('GRUPPENGEHEIM'));assert.ok(!JSON.stringify(detail).includes('UNBEKANNTE-SICHTBARKEIT'));assert.equal(detail.links.length,0);assert.equal(detail.attachments[0].available,false);
    const publicDetail=await api('portal/requests/HELP-1',customer);const output=JSON.stringify(publicDetail);for(const hidden of ['INTERNE-NOTIZ','GRUPPENGEHEIM','AGENTENFELD-GEHEIM','"history"','"sla"','"assignee"'])assert.ok(!output.includes(hidden),hidden);assert.ok(output.includes('Öffentliche Antwort'));assert.ok(output.includes('Legacy öffentlich'));assert.ok(output.includes('Kundenwert'));
    await assert.rejects(()=>api('portal/requests/HELP-2',customer),e=>e.status===404);await assert.rejects(()=>api('portal/attachments/private-file',customer),e=>e.status===404);
    for(const path of ['boards/board','queues/queue','portals/portal','request-types/request','customers','dashboards/dash','reports','reports/report1','configuration','projects/p','projects/p/summary','projects/p/settings','projects/software/timeline'])assert.ok(await api(path),path);
    const summary=await api('projects/p/summary');assert.equal(summary.total,60);assert.equal(summary.statusCounts[0].category,'2');assert.ok(summary.recent.length===10&&summary.boards.length===1);
    const settings=await api('projects/p/settings');assert.equal(settings.workflow[0].issuetypeName,'Service Request');assert.equal(settings.roles[0].actors[0],'Gruppe agents');assert.ok(settings.permissions.length&&settings.boards[0].columns[0].statuses[0]==='Offen');
    await assert.rejects(()=>api('projects/p/unbekannt'),e=>e.status===404);
    const line=await api('projects/software/timeline');assert.equal(line.lanes.length,1);assert.equal(line.lanes[0].key,'DEV-2');assert.equal(line.lanes[0].children.length,2);
    assert.deepEqual(line.undated.map(i=>i.key),['DEV-5']);assert.equal(line.releases[0].name,'2.0');assert.equal(line.sprints[0].name,'Sprint 12');assert.equal(line.startFieldName,'Startdatum');
    const devBoard=await api('boards/dev-board?limit=500');assert.equal(devBoard.columns.length,3);assert.equal(devBoard.items.find(i=>i.key==='DEV-3').points,'5');assert.equal(devBoard.items.find(i=>i.key==='DEV-3').parentKey,'DEV-2');
    assert.equal((await api('boards/dev-board')).items.find(i=>i.key==='DEV-3').sprintIds[0],'dev-sprint');
    const typed=(await api('issues/HELP-1')).fields;assert.equal(typed.find(f=>f.name==='Kategorie').type,'option');assert.equal(typed.find(f=>f.name==='Kategorie').values[0].text,'Hardware');
    assert.equal(typed.find(f=>f.name==='Ansprechpartner').values[0].text,'Agentin');assert.match(typed.find(f=>f.name==='Notizen').values[0].html,/<h3>Hinweis .*<strong>zügig<\/strong>/);
    assert.equal((await api('boards/board')).columns[0].statuses[0],'open');assert.equal((await api('boards/board?sprint=sprint')).total,1);assert.match((await api('queues/bad-queue')).unavailable,/nicht auswertbar/);
    for(const q of ['project = HELP AND (status = Offen OR status IS EMPTY)','assignee = currentUser()','issuetype in standardIssueTypes()','cf[101] ~ Kunden','sprint in openSprints()','created >= -30d ORDER BY key ASC']){const parsed=compileJql(b.db,q,a,b.report.archiveDate);assert.doesNotThrow(()=>b.db.prepare('SELECT i.id FROM issues i WHERE '+parsed.where+' ORDER BY '+parsed.order).all());}
    for(const q of ['project = HELP garbage','issue in unknownFunction()','project = HELP OR','text ~ "*"','project = HELP; DROP TABLE issues','project = HELP ORDER BY nonsense'])assert.throws(()=>compileJql(b.db,q,a,b.report.archiveDate),e=>e.status===422);
    for(const p of ['confluence','jira']){identityDb.prepare('UPDATE product_access SET enabled=0 WHERE product=?').run(p);assert.equal(productAccess(identityDb,agent)[p],false);assert.throws(()=>assertProduct(identityDb,agent,p));identityDb.prepare('UPDATE product_access SET enabled=1 WHERE product=?').run(p);}
    identityDb.prepare('INSERT INTO user_product_access VALUES(?,?,0)').run(agent.externalId,'jira');assert.throws(()=>assertProduct(identityDb,agent,'jira'));assertProduct(identityDb,customer,'jira');
    close();backups=await loadBackups(options);assert.equal(backups.get(b.id).cached,true);
    close();await writeFile(path.join(dir,'jira.zip'),zipBytes(jiraFixture({changed:true})));backups=await loadBackups(options);assert.equal(backups.get(b.id).cached,false);assert.equal(rows(backups.get(b.id).db,'Issue')[0].summary,'Geänderte Anfrage');
    const cache=await readFile(path.join(options.cacheDir,b.id+'.sqlite'));close();await writeFile(path.join(dir,'jira.zip'),zipBytes({'entities.xml':'<entity-engine-xml><Issue>'}));backups=await loadBackups(options);assert.ok(backups.get(b.id).error);assert.deepEqual(await readFile(path.join(options.cacheDir,b.id+'.sqlite')),cache);
  }finally{close();identityDb?.close();await rm(dir,{recursive:true,force:true});}
});
test('Jira Wiki and ADF remain readable without executable or remote media content',()=>{
  const adf={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<script>alert(1)</script>',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]},{type:'unsupportedWidget',content:[{type:'text',text:'Lesbarer Rest'}]}]};
  for(const input of [adf,'h1. Überschrift\n* Liste\n{code}<img src=x onerror=alert(1)>{code}\n[Link|javascript:alert(1)]']){const html=renderJira(input);assert.doesNotMatch(html,/<script|<img|href="javascript:|onerror="/);}
  assert.match(renderJira(adf),/Nicht unterstütztes Element/);assert.match(renderJira(adf),/Lesbarer Rest/);
});
