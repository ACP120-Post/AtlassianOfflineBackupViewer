import React,{useState} from 'react';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge/new';
import GridIcon from '@atlaskit/icon/core/app-switcher';
import ArchiveIcon from '@atlaskit/icon/core/archive-box';
import SettingsIcon from '@atlaskit/icon/core/settings';
import {useResource,State,Message,Html} from './ui.jsx';
import './jira.css';
import ClockIcon from '@atlaskit/icon/core/clock';
import PauseIcon from '@atlaskit/icon/core/video-pause';
import CheckIcon from '@atlaskit/icon/core/check-circle';
import ErrorIcon from '@atlaskit/icon/core/status-error';
import QuestionIcon from '@atlaskit/icon/core/question-circle';
import PriorityIcon from '@atlaskit/icon/core/priority-medium';
import PriorityHighIcon from '@atlaskit/icon/core/priority-high';
import PriorityLowIcon from '@atlaskit/icon/core/priority-low';
import TaskIcon from '@atlaskit/icon/core/task';
import BugIcon from '@atlaskit/icon/core/bug';
import StoryIcon from '@atlaskit/icon/core/story';
import EpicIcon from '@atlaskit/icon/core/epic';
import SubtaskIcon from '@atlaskit/icon/core/subtasks';
import LinkExternalIcon from '@atlaskit/icon/core/link-external';
import {formatDuration,slaSnapshot} from './jira-sla.mjs';
import {t,locale,LangSwitcher} from './i18n.jsx';
const date=v=>{const d=new Date(/^\d{12,}$/.test(String(v))?Number(v):v);return v&&Number.isFinite(d.getTime())?d.toLocaleString(locale()):t('Not given in the export');};
const day=v=>{const d=new Date(/^\d{12,}$/.test(String(v))?Number(v):v);return v&&Number.isFinite(d.getTime())?d.toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'}):t('No date');};
const num=v=>Number(v||0).toLocaleString(locale());
const title={assets:'Assets',projects:t('Projects'),search:t('Issues'),boards:t('Boards'),queues:t('Queues'),customers:t('Customers and organizations'),portals:t('Customer portals'),'request-types':t('Request types'),dashboards:t('Dashboards'),reports:t('Reports'),configuration:t('Project configuration'),report:t('Import report'),filters:t('Saved filters'),requests:t('My and shared requests')};
const projectType=type=>type==='service_desk'?t('Service management'):type==='software'?t('Software'):t('Business');
const tones=['blue','purple','green','orange','red','teal'];
const tone=text=>tones[[...String(text||'')].reduce((a,c)=>a+c.charCodeAt(0),0)%tones.length];
// ponytail: Export ohne Typ-Icons; bekannte Namen nutzen ADS-Icons, sonst das neutrale Task-Icon.
const typeStyle=name=>{const n=String(name||'').toLowerCase();
  return /epic|epos/.test(n)?['purple',EpicIcon]:/bug|fehler/.test(n)?['red',BugIcon]:/story/.test(n)?['green',StoryIcon]:
    /unteraufgabe|sub-?task/.test(n)?['teal',SubtaskIcon]:['blue',TaskIcon];};
function TypeIcon({type}) {const [toneName,Icon]=typeStyle(type);return <span className="jira-type-icon" data-tone={toneName} title={type}><Icon label={type||t('Issue')}/></span>;}
function Priority({name}) {const Icon=/highest|high|critical|blocker|major|hoch|höchste|kritisch/i.test(name)?PriorityHighIcon:/lowest|low|minor|trivial|niedrig/i.test(name)?PriorityLowIcon:PriorityIcon;return <span className="jira-priority"><Icon label=""/>{name}</span>;}
function Avatar({name}) {const initials=String(name||'?').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
  return <span className="jira-avatar" data-tone={tone(name)} aria-hidden="true">{initials}</span>;}
function User({name}) {return <span className="jira-user"><Avatar name={name}/>{name||t('Unassigned')}</span>;}
function StatusTag({status,category}) {return <Lozenge appearance={String(category)==='3'?'success':String(category)==='4'?'inprogress':'default'}>{status||t('No status')}</Lozenge>;}
function Chips({values}) {return <span className="jira-chips">{values.map((v,i)=><span className="jira-chip" key={i}>{v}</span>)}</span>;}
function FieldValue({field}) {
  const values=field.values||[];
  if(!values.length)return <span className="jira-empty">{t('No value in the export')}</span>;
  if(field.type==='priority'||field.customfieldtypekey?.endsWith(':priority'))return <Priority name={values.map(v=>v.text).join(', ')}/>;
  if(field.type==='html')return <>{values.map((v,i)=><Html key={i} html={v.html}/>)}</>;
  if(field.type==='user')return <>{values.map((v,i)=><User key={i} name={v.text}/>)}</>;
  if(['option','labels','group','organization'].includes(field.type))return <Chips values={values.map(v=>v.text)}/>;
  if(field.type==='date')return <span>{values.map(v=>day(v.text)).join(', ')}</span>;
  if(field.type==='datetime')return <span>{values.map(v=>date(v.text)).join(', ')}</span>;
  if(field.type==='number')return <span>{values.map(v=>num(v.text)).join(', ')}</span>;
  if(field.type==='url')return <>{values.map((v,i)=><a key={i} href={v.text} target="_blank" rel="noreferrer noopener">{v.text}</a>)}</>;
  return <span>{values.map(v=>v.text).join(', ')}</span>;
}
export function ProductSwitcher(){return <a className="product-switcher" href="/" aria-label={t('Switch product')}><GridIcon label=""/><span>{t('Products')}</span></a>;}
function Header({name,me,identity}) {return <header className="topbar jira-topbar"><a className="brand" href="/">{name}</a><ProductSwitcher/><span className="read-only">{t('Read only')}</span>{me.isAdmin&&<a href="/settings">{t('Administration')}</a>}<LangSwitcher/>{identity}</header>;}
export function ProductHome({backups,me,identity}) {return <><a className="skip-link" href="#main">{t('Skip to content')}</a><Header name={t('Backup platform')} me={me} identity={identity}/><main className="overview-main product-home" id="main" tabIndex={-1}><h1>{t('Your archived workspaces')}</h1><p>{t('Confluence, Jira and Jira Service Management with shared login. All content shows the stored archive state.')}</p><State resource={backups}>
    <div className="product-list">{['confluence','jira'].filter(p=>me.products?.[p]).map(product=><section key={product}><h2>{product==='jira'?'Jira':'Confluence'}</h2><p>{product==='jira'?t('Projects, issues, software boards and service management'):t('Knowledge, pages and spaces')}</p>{backups.data?.filter(b=>b.product===product).map(b=><div className="product-backup" key={b.id}><ArchiveIcon label={t('Backup')}/><div><a href={product==='jira'?`/jira/b/${b.id}/projects`:`/b/${b.id}/spaces`}>{b.name}</a>{b.error&&<p>{t(b.error)}</p>}{product==='jira'&&b.features?.jsm&&<p><a href={`/jira/b/${b.id}/portal/portals`}>{t('Open customer portal')}</a></p>}</div></div>)}{!backups.data?.some(b=>b.product===product)&&<p>{t('No backup available for this product.')}</p>}</section>)}</div>
    {!Object.values(me.products||{}).some(Boolean)&&<Message title={t('No product enabled')}>{t('Administration manages product access.')}</Message>}
  </State></main></>;}
async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
export function PlatformSettings({users,licensed=true}) {
  const [revision,setRevision]=useState(0),[error,setError]=useState(''),[saved,setSaved]=useState('');
  const products=useResource(`/api/auth/products?v=${revision}`);
  const mapping=useResource(licensed?`/api/auth/jira-identities?v=${revision}`:null),rights=useResource(licensed?`/api/auth/product-users?v=${revision}`:null);
  const [backupId,setBackupId]=useState(''),[key,setKey]=useState(''),[external,setExternal]=useState('');
  const save=(url,body)=>post(url,body).then(()=>{setSaved(t('Saved. Product permissions apply on the next request.'));setError('');setRevision(v=>v+1);}).catch(e=>setError(e.message));
  const selected=mapping.data?.backups.find(b=>b.id===backupId)||mapping.data?.backups[0];
  return <section><h2>{t('Product access')}</h2>{error&&<Message title={t('Cannot save')} error>{t(error)}</Message>}<p role="status">{saved}</p><State resource={products}>{products.data&&<div className="jira-controls">{['confluence','jira'].map(p=><label key={p}><input type="checkbox" checked={products.data[p]} onChange={e=>save('/api/auth/products',{...products.data,[p]:e.target.checked})}/>{p==='jira'?t('Jira including JSM'):'Confluence'}</label>)}</div>}</State>
    {licensed&&<details><summary>{t('Product permissions per user')}</summary><State resource={rights}><div className="table-scroll"><table className="data-table"><thead><tr><th>{t('User')}</th><th>Confluence</th><th>Jira</th></tr></thead><tbody>{users.map(u=><tr key={u.external_id}><td>{u.display_name||u.external_id}</td>{['confluence','jira'].map(p=><td key={p}><input type="checkbox" aria-label={t('{product} for {user}',{product:p,user:u.display_name||u.external_id})} checked={rights.data?.find(r=>r.external_id===u.external_id&&r.product===p)?.enabled!==0} onChange={e=>save('/api/auth/product-users',{externalId:u.external_id,product:p,enabled:e.target.checked})}/></td>)}</tr>)}</tbody></table></div></State></details>}
    {licensed&&<><h2>{t('Map Jira identities')}</h2><p>{t('Unique external IDs are detected. Differing Jira keys can be mapped to a central user here. Display names are not matched automatically.')}</p>
    <State resource={mapping}>{selected&&<><form className="jira-controls" onSubmit={e=>{e.preventDefault();save('/api/auth/jira-identities',{backupId:selected.id,jiraUserKey:key,externalId:external||null});}}>
      <label>{t('Jira backup')}<select value={selected.id} onChange={e=>{setBackupId(e.target.value);setKey('');}}>{mapping.data.backups.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>{t('Jira user')}<select required value={key} onChange={e=>setKey(e.target.value)}><option value="">{t('Select')}</option>{selected.users.map(u=><option key={u.id} value={u.id}>{u.name} · {u.id}</option>)}</select></label>
      <label>{t('Central identity')}<select value={external} onChange={e=>setExternal(e.target.value)}><option value="">{t('Remove explicit mapping')}</option>{users.map(u=><option value={u.external_id} key={u.external_id}>{u.display_name} · {u.external_id}</option>)}</select></label><Button type="submit">{t('Save mapping')}</Button></form>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('Jira key')}</th><th>{t('Central identity')}</th></tr></thead><tbody>{mapping.data.mappings.filter(m=>m.backup_id===selected.id).map(m=><tr key={m.jira_user_key}><td>{m.jira_user_key}</td><td>{m.external_id}</td></tr>)}</tbody></table></div></>}</State></>}
  </section>;
}
function Pagination({data,route,navigate}) {const go=offset=>{const u=new URL(route);u.searchParams.set('offset',offset);navigate(u.pathname+u.search);};return <div className="jira-pagination" aria-label={t('Pagination')}><span role="status">{t('{n} results',{n:num(data.total)})} · {data.total?num(data.offset+1):0}–{num(Math.min(data.offset+data.items.length,data.total))}</span><Button isDisabled={!data.offset} onClick={()=>go(Math.max(0,data.offset-data.limit))}>{t('Back')}</Button><Button isDisabled={data.offset+data.limit>=data.total} onClick={()=>go(data.offset+data.limit)}>{t('Next')}</Button></div>;}
function IssueTable({items=[],base,portal=false,columns}) {
  const defaults=portal?['key','summary','status','updated']:['issuetype','key','summary','status','priority','assignee'];
  const cols=columns?.length?columns.map(c=>c.column_id):defaults;
  const labels={key:t('Key'),issuekey:t('Key'),summary:t('Summary'),status:t('Status'),priority:t('Priority'),assignee:t('Assignee'),reporter:t('Reporter'),created:t('Created'),updated:t('Updated'),issuetype:t('Type')};
  return <div className="table-scroll" role="region" aria-label="Vorgangstabelle" tabIndex={0}><table className="data-table jira-table"><thead><tr>{cols.map((c,i)=><th key={`${c}-${i}`} className={c==='issuetype'?'jira-col-icon':undefined}>{labels[c]||columns?.find(col=>col.column_id===c)?.name||c}</th>)}</tr></thead><tbody>{items.map(item=><tr key={item.id}>{cols.map((c,i)=>{const value=item[c==='issuekey'?'key':c==='issuetype'?'type':c]??item.columnValues?.[c];return <td key={`${c}-${i}`} className={c==='issuetype'?'jira-col-icon':undefined}>{c==='issuetype'?<TypeIcon type={value}/>:c==='key'||c==='issuekey'?<a className="jira-key" href={`${base}/${portal?'requests':'issues'}/${item.key}`}>{value}</a>:c==='summary'?<a href={`${base}/${portal?'requests':'issues'}/${item.key}`}>{value}</a>:c==='status'?<StatusTag status={value} category={item.statusCategory}/>:c==='priority'?<FieldValue field={{type:'priority',values:value&&value!=='–'?[{text:value}]:[]}}/>:c==='assignee'||c==='reporter'?<User name={value}/>:['created','updated'].includes(c)?day(value):value||t('Not available in the export')}</td>;})}</tr>)}</tbody></table>{!items.length&&<p>{t('No visible issues for this filter.')}</p>}</div>;
}
function IssueRow({item,base}) {return <a className="jira-row" href={`${base}/issues/${item.key}`}><TypeIcon type={item.type}/><span className="jira-key">{item.key}</span><span className="jira-row-summary">{item.summary}</span>{item.parentKey&&<span className="jira-chip">{item.parentKey}</span>}{!!item.points&&<span className="jira-points">{item.points}</span>}<StatusTag status={item.status} category={item.statusCategory}/><Avatar name={item.assignee}/></a>;}
function RecordTable({items,columns}) {return <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(([k,n])=><th key={k}>{n}</th>)}</tr></thead><tbody>{items.map((r,i)=><tr key={r.id||i}>{columns.map(([k])=><td key={k}>{Array.isArray(r[k])?r[k].join(', '):String(r[k]??'–')}</td>)}</tr>)}</tbody></table>{!items.length&&<p>{t('No entries in the export.')}</p>}</div>;}
function LinkList({data,view,base}) {return <div className="jira-link-list">{data.map(d=><a key={d.id} href={view==='filters'?`${base}/search?filter=${d.id}`:`${base}/${view}/${d.id}`}><strong>{d.name||d.pagename||d.key}</strong>{d.key&&<span>{d.key}</span>}{d.project&&<span>{d.project}</span>}{d.unavailable&&<span>{d.unavailable}</span>}</a>)}{!data.length&&<Message title={t('No visible entries')}>{t('No matching export data is available for this identity. Administration can check the identity mapping.')}</Message>}</div>;}
function Detail({label,children,type='text',value}) {return <div className="jira-detail-row"><dt>{label}</dt><dd>{children??<FieldValue field={{type,values:(Array.isArray(value)?value:[value]).filter(v=>v!=null&&v!==''&&v!=='–').map(text=>({text}))}}/>}</dd></div>;}
const slaStates={running:[t('Running'),ClockIcon],paused:[t('Paused'),PauseIcon],completed:[t('Completed'),CheckIcon],pending:[t('Not started yet'),ClockIcon],breached:[t('Target breached'),ErrorIcon],met:[t('Target met'),CheckIcon],unknown:[t('Unknown'),QuestionIcon]};
function SlaStatus({state}) {const [label,Icon]=slaStates[state];return <span className="jira-sla-status" data-state={state}><Icon label=""/>{label}</span>;}
function Slas({items}) {return <details open className="jira-slas"><summary>{t('Archived SLAs')} <span className="count-badge">{items.length}</span></summary><p className="jira-empty">{t('Stored values as of the archive date. Times are not counted further.')}</p>{items.map(s=>{const {state,outcome,complete,startTime,stopTime}=slaSnapshot(s);return <section key={s.id}><h3>{s.name||t('Unnamed SLA')}</h3><SlaStatus state={state}/><dl className="jira-detail-list">
  {(state==='paused'||complete)&&<><Detail label={t('Elapsed')}>{formatDuration(complete?.elapsedTime ?? s.paused_cycle_elapsed_time)}</Detail><Detail label={t('Remaining')}>{formatDuration(complete?.remainingTime ?? s.paused_cycle_remaining_time)}</Detail></>}
  {complete&&<Detail label={t('Goal')}>{formatDuration(complete.goalTime)}</Detail>}
  {state==='running'&&<Detail label={t('Remaining')}>{t('Unknown')}</Detail>}
  <Detail label={state==='completed'?t('Result'):t('Last completed cycle')}><SlaStatus state={outcome}/></Detail>
  {startTime&&<Detail label={t('Start')}>{date(startTime)}</Detail>}
  {stopTime&&<Detail label={t('Stop')}>{date(stopTime)}</Detail>}
  {s.last_complete_cycle_end_date&&<Detail label={t('Last completion')}>{date(s.last_complete_cycle_end_date)}</Detail>}
</dl></section>;})}</details>;}

function Issue({data,base,portal,api}) {
  const [tab,setTab]=useState('comments');
  const extra=(data.fields||[]).filter(f=>!['com.atlassian.servicedesk:sd-request-participants','com.atlassian.servicedesk:sd-customer-organizations'].includes(f.customfieldtypekey));
  return <><nav className="breadcrumbs">{data.projectKey&&!portal?<a href={`${base}/projects/${data.projectKey}/summary`}>{data.projectName}</a>:<a href={`${base}/${portal?'requests':'search'}`}>{portal?t('Requests'):t('Issues')}</a>}<span>/</span>{!portal&&data.parent&&<><a href={`${base}/issues/${data.parent.key}`}>{data.parent.key}</a><span>/</span></>}<a href={`${base}/${portal?'requests':'issues'}/${data.key}`}>{data.key}</a></nav>
    {!portal&&<div className="jira-original-source"><span>{t('Original in Jira')}</span>{data.originalUrl?<a href={data.originalUrl} target="_blank" rel="noopener noreferrer" title={data.originalUrl}>{data.originalUrl} <LinkExternalIcon label=""/></a>:data.originalSite?<a href={`${data.originalSite}/browse/${encodeURIComponent(data.key)}`} target="_blank" rel="noopener noreferrer">{t('Open known Jira instance')} <LinkExternalIcon label=""/></a>:<small>{t('The backup contains no Jira instance address.')}</small>}</div>}
    <div className="jira-issue-head"><TypeIcon type={data.type}/><h1>{data.summary}</h1></div>
    <div className="jira-controls jira-issue-actions"><Button isDisabled>{portal?t('Reply'):t('Edit')}</Button><Button isDisabled>{t('Change status')}</Button>{portal&&<StatusTag status={data.status} category={data.statusCategory}/>} {data.requestType&&<span className="jira-chip">{data.requestType.name}</span>}<span className="jira-empty">{t('Archived request · read only')}</span></div>
    <div className="jira-issue-layout"><div className="jira-issue-content">
      <details open className="jira-content-panel"><summary><span className="jira-panel-heading" role="heading" aria-level="2">{t('Description')}</span></summary><Html html={data.descriptionHtml}/>{!data.descriptionHtml&&<p className="jira-empty">{t('No description in the export.')}</p>}</details>
      {data.environmentHtml&&<details open className="jira-content-panel"><summary><span className="jira-panel-heading" role="heading" aria-level="2">{t('Environment')}</span></summary><Html html={data.environmentHtml}/></details>}
      {portal&&!!data.fields?.length&&<details open className="jira-content-panel"><summary><span className="jira-panel-heading" role="heading" aria-level="2">{t('Request details')}</span></summary><dl className="jira-detail-list">{data.fields.map(f=><Detail key={f.id} label={f.name}><FieldValue field={f}/></Detail>)}</dl></details>}
      <details open className="jira-content-panel"><summary><span className="jira-panel-heading" role="heading" aria-level="2">{t('Attachments')} <span className="count-badge">{data.attachments.length}</span></span></summary>{data.attachments.length?<ul className="jira-attachments">{data.attachments.map(a=><li key={a.id}><span>{a.filename} · {t('{n} bytes',{n:num(a.filesize)})}</span>{a.available?<a href={`${api}/attachments/${a.id}`} download>{t('Download')}</a>:<Lozenge appearance="warning">{t('File missing from the archive')}</Lozenge>}</li>)}</ul>:<p className="jira-empty">{portal?t('No customer-visible attachment metadata available.'):t('No attachment metadata available.')}</p>}</details>
      {!portal&&<>{!!data.children?.length&&<details open className="jira-content-panel"><summary><span className="jira-panel-heading" role="heading" aria-level="2">{t('Child issues')}</span></summary><IssueTable items={data.children} base={base}/></details>}
      {!!(data.links?.filter(l=>String(l.relationship||'').toLowerCase()!=='jira_subtask_outward').length||data.remoteLinks?.length)&&<details open className="jira-content-panel"><summary><span className="jira-panel-heading" role="heading" aria-level="2">{t('Links')}</span></summary>{data.links?.filter(l=>String(l.relationship||'').toLowerCase()!=='jira_subtask_outward').map((l,i)=><div className="jira-link-row" key={i}><span className="jira-empty">{l.relationship}</span><IssueRow item={l} base={base}/></div>)}{data.remoteLinks?.map(l=><Html key={l.id} html={l.html}/>)}</details>}</>}
      <details open className="jira-content-panel"><summary><span className="jira-panel-heading" role="heading" aria-level="2">{t('Activity')}</span></summary><div className="jira-tabs" role="group" aria-label={t('Activity view')}>{(portal?['comments']:['comments','history','worklogs']).map(id=><Button key={id} isSelected={tab===id} onClick={()=>setTab(id)}>{({comments:t('Comments'),history:t('History'),worklogs:t('Work logs')})[id]}</Button>)}</div>
      {tab==='comments'&&(data.comments.length?data.comments.map(c=><article key={c.id} className="jira-comment"><Avatar name={c.author}/><div><div className="jira-comment-head"><strong>{c.author}</strong><span className="jira-empty">{date(c.created)}</span>{!portal&&<Lozenge appearance={c.public?'success':'neutral'}>{c.public?t('Public reply'):t('Internal or restricted comment')}</Lozenge>}</div><Html html={c.html}/></div></article>):<p className="jira-empty">{t('No visible comments in the export.')}</p>)}
      {tab==='history'&&(data.history?.length?data.history.map(h=><article className="jira-comment" key={h.id}><Avatar name={h.author}/><div><div className="jira-comment-head"><strong>{h.author}</strong><span className="jira-empty">{date(h.created)}</span></div><dl className="jira-fields">{h.items.map(i=><React.Fragment key={i.id}><dt>{i.field}</dt><dd>{i.oldstring||i.oldvalue||t('Empty')} → {i.newstring||i.newvalue||t('Empty')}</dd></React.Fragment>)}</dl></div></article>):<p className="jira-empty">{t('No history in the export.')}</p>)}
      {tab==='worklogs'&&(data.worklogs?.length?data.worklogs.map(w=><article className="jira-comment" key={w.id}><Avatar name={w.author}/><div><div className="jira-comment-head"><strong>{w.author}</strong><span className="jira-empty">{t('{n} seconds',{n:num(w.timeworked)})} · {date(w.startdate)}</span></div><Html html={w.html}/></div></article>):<p className="jira-empty">{t('No visible work logs in the export.')}</p>)}</details>
    </div>{!portal&&<aside className="jira-detail-panel" aria-label={t('Issue details')}><div className="jira-issue-status"><StatusTag status={data.status} category={data.statusCategory}/></div><details open><summary>{t('Details')}</summary><dl className="jira-detail-list">
      <Detail label={t('Assignee')} type="user" value={data.assignee}/><Detail label={t('Reporter')} type="user" value={data.reporter}/>
      <Detail label={t('Priority')} type="priority" value={data.priority}/><Detail label={t('Resolution')} value={data.resolution||t('Unresolved')}/>
      {data.points!=null&&<Detail label={t('Story points')} type="number" value={data.points}/>}
      <Detail label={t('Labels')} type="labels" value={data.labels}/>
      <Detail label={t('Versions')} type="option" value={data.versions?.map(v=>v.name)}/>
      <Detail label={t('Components')} type="option" value={data.components?.map(v=>v.name)}/>
      {!!data.participants?.length&&<Detail label={t('Participants')} type="user" value={data.participants}/>}
      {!!data.organizations?.length&&<Detail label={t('Organizations')} type="organization" value={data.organizations}/>}
      <Detail label={t('Due')} type="date" value={data.due}/>
    </dl></details>
      {!!extra.length&&<details><summary>{t('More fields')} <span className="count-badge">{extra.length}</span></summary><dl className="jira-detail-list">{extra.map(f=><Detail key={f.id} label={f.name}><FieldValue field={f}/></Detail>)}</dl></details>}
      <details><summary>{t('Time tracking')}</summary><dl className="jira-detail-list"><Detail label={t('Time spent')}>{formatDuration(data.time?.spent,1000)}</Detail><Detail label={t('Remaining estimate')}>{formatDuration(data.time?.remaining,1000)}</Detail><Detail label={t('Original estimate')}>{formatDuration(data.time?.original,1000)}</Detail></dl></details>
      {!!data.sla?.length&&<Slas items={data.sla}/>}
      <dl className="jira-detail-list jira-issue-dates"><Detail label={t('Created')} type="datetime" value={data.created}/><Detail label={t('Updated')} type="datetime" value={data.updated}/></dl>
    </aside>}</div></>;
}
function Search({route,navigate,base,api,portal,scope,heading}) {
  const [q,setQ]=useState(route.searchParams.get('q')||''),[jql,setJql]=useState(route.searchParams.get('jql')||'');
  const path=scope?`${base}/projects/${scope.key}/issues`:`${base}/${portal?'requests':'search'}`;
  const params=new URLSearchParams(route.search);if(scope)params.set('project',scope.id);
  const data=useResource(`${api}/${portal?'requests':'search'}?${params}`),help=useResource(portal?null:`${api}/jql`);
  return <><h1>{heading||(portal?t('My and shared requests'):t('Search issues'))}</h1><form className="jira-search" onSubmit={e=>{e.preventDefault();const next=new URLSearchParams(route.search);next.set('q',q);next.set('jql',jql);next.delete('offset');navigate(`${path}?${next}`);}}><label>{t('Search term')}<input value={q} onChange={e=>setQ(e.target.value)}/></label>{!portal&&<label>{t('JQL filter')}<input value={jql} onChange={e=>setJql(e.target.value)} placeholder={'project = ITS AND resolution IS EMPTY'}/></label>}<Button type="submit" appearance="primary">{t('Search')}</Button></form>{!portal&&<details><summary>{t('Supported JQL queries')}</summary><p>{t(help.data?.help)}</p><a href={`${base}/filters`}>{t('Open saved filters')}</a></details>}<State resource={data}>{data.data&&<><IssueTable items={data.data.items} base={base} portal={portal}/><Pagination data={data.data} route={route} navigate={navigate}/></>}</State></>;
}
const columnName=name=>({'gh.workflow.preset.todo':t('To do'),'gh.workflow.preset.inprogress':t('In progress'),'gh.workflow.preset.done':t('Done'),'gh.boards.todo':t('To do'),'gh.boards.inprog':t('In progress'),'gh.boards.done':t('Done'),'gh.workflow.preset.backlog':t('Backlog'),'gh.workflow.preset.selectedfordevelopment':t('Selected for development')}[name]||name);
function Card({item,base}) {return <a className="jira-issue-card" key={item.id} href={`${base}/issues/${item.key}`}><strong>{item.summary}</strong><div className="jira-card-foot"><TypeIcon type={item.type}/><span className="jira-key">{item.key}</span>{item.parentKey&&<span className="jira-chip">{item.parentKey}</span>}<span className="jira-card-spacer"/>{!!item.points&&<span className="jira-points">{item.points}</span>}<Avatar name={item.assignee}/></div></a>;}
function Board({data,base,route,navigate}) {
  const [group,setGroup]=useState('none');
  const change=(key,value)=>{const u=new URL(route);value?u.searchParams.set(key,value):u.searchParams.delete(key);u.searchParams.delete('offset');navigate(u.pathname+u.search);};
  const sprint=route.searchParams.get('sprint'),items=data.items||[];
  const columns=[...(data.columns||[]),{id:'unmapped',name:t('Without exported column mapping'),statuses:[]}];
  const inColumn=(c,list)=>list.filter(i=>c.id==='unmapped'?!data.columns.some(col=>col.statuses.includes(i.statusId)):c.statuses.includes(i.statusId));
  const lanes=group==='none'?[['',items]]:Object.entries(items.reduce((acc,i)=>{const key=group==='assignee'?(i.assignee||t('Unassigned')):(i.parentKey||t('No epic'));(acc[key]||=[]).push(i);return acc;},{}));
  return <><div className="page-title-row"><h1>{data.name}</h1><Lozenge>{data.sprints_enabled==='true'?t('Scrum'):t('Kanban')}</Lozenge></div>
    <div className="jira-controls"><label>{t('Sprint')}<select aria-label={t('Sprint')} value={sprint||''} onChange={e=>change('sprint',e.target.value)}><option value="">{t('All sprints')}</option>{data.sprints.map(s=><option key={s.id} value={s.id}>{s.name} ({s.closed==='true'?t('Completed'):s.started==='true'?t('Started'):t('Planned')})</option>)}</select></label>
      <label>{t('Quick filter')}<select aria-label={t('Quick filter')} value={route.searchParams.get('quick')||''} onChange={e=>change('quick',e.target.value)}><option value="">{t('No quick filter')}</option>{data.quickFilters.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select></label>
      <label>{t('Grouping')}<select aria-label={t('Grouping')} value={group} onChange={e=>setGroup(e.target.value)}><option value="none">{t('None')}</option><option value="assignee">{t('Assignee')}</option><option value="epic">Epic</option></select></label>
      <Button isDisabled>{t('Start sprint')}</Button></div>
    {sprint&&data.sprints.filter(s=>s.id===sprint).map(s=><div className="backup-banner" key={s.id}><div><strong>{s.name}</strong>{s.goal&&<p>{s.goal}</p>}<p>{s.start_date?`${day(Number(s.start_date))} – ${day(Number(s.end_date))}`:t('No period in the export')}</p></div></div>)}
    {data.unavailable?<Message title={t('Board filter cannot be reconstructed')}>{t(data.unavailable)}</Message>:<><p className="jira-empty">{t('{n} visible issues on the board.',{n:num(data.total)})}</p>
      {lanes.map(([lane,list])=><section className="jira-swimlane" key={lane||'all'}>{lane&&<h2 className="jira-swimlane-title">{lane} <span className="count-badge">{list.length}</span></h2>}
        <div className="jira-board">{columns.map(c=>{const cards=inColumn(c,list);if(c.id==='unmapped'&&!cards.length)return null;
          return <section className="jira-board-column" key={c.id}><h3>{columnName(c.name)} <span className="count-badge">{cards.length}</span>{Number(c.maxim)>0&&cards.length>Number(c.maxim)&&<Lozenge appearance="removed">{t('Over limit {n}',{n:c.maxim})}</Lozenge>}</h3>{cards.map(i=><Card key={i.id} item={i} base={base}/>)}{!cards.length&&<p className="jira-empty">{t('Empty')}</p>}</section>;})}</div></section>)}
      {data.total>data.items.length&&<Pagination data={data} route={route} navigate={navigate}/>}</>}</>;
}
function Backlog({data,base,route,navigate}) {
  const items=data.items||[],sprints=(data.sprints||[]).filter(s=>s.closed!=='true');
  const sections=[...sprints.map(s=>[s,items.filter(i=>i.sprintIds?.includes(s.id))]),[null,items.filter(i=>!i.sprintIds?.length||!sprints.some(s=>i.sprintIds.includes(s.id)))]];
  return <><h1>{t('Backlog')}</h1>{data.unavailable?<Message title={t('Board filter cannot be reconstructed')}>{t(data.unavailable)}</Message>:<>
    {sections.map(([s,list])=><section className="jira-backlog-section" key={s?.id||'backlog'}>
      <h2>{s?s.name:t('Backlog')} <span className="count-badge">{list.length}</span>{s&&<Lozenge appearance={s.started==='true'?'inprogress':'default'}>{s.started==='true'?t('Started'):t('Planned')}</Lozenge>}</h2>
      {s&&<p className="jira-empty">{s.goal||t('No sprint goal in the export')} · {s.start_date?`${day(Number(s.start_date))} – ${day(Number(s.end_date))}`:t('No period in the export')}</p>}
      {list.length?list.map(i=><IssueRow key={i.id} item={i} base={base}/>):<p className="jira-empty">{t('No visible issues.')}</p>}</section>)}
    {data.total>items.length&&<Pagination data={data} route={route} navigate={navigate}/>}</>}</>;
}
function Timeline({data,base}) {
  if(!data.start)return <><h1>{t('Timeline')}</h1><Message title={t('No dated issues in the export')}>{t('The timeline only shows issues with an exported start and due date')}{data.startFieldName?t(' (start field “{field}”)',{field:data.startFieldName}):t(', but this export contains no start date field')}.</Message>{!!data.undated.length&&<><h2>{t('Without period in the export')} <span className="count-badge">{data.undated.length}</span></h2>{data.undated.map(i=><IssueRow key={i.id} item={i} base={base}/>)}</>}</>;
  const from=new Date(data.start),to=new Date(data.end),span=Math.max(86400000,to-from);
  const pct=v=>`${Math.max(0,Math.min(100,(new Date(v)-from)/span*100))}%`;
  const width=(a,b)=>`${Math.max(1.5,Math.min(100,(new Date(b)-new Date(a))/span*100))}%`;
  const months=[];for(const d=new Date(from.getFullYear(),from.getMonth(),1);d<=to;d.setMonth(d.getMonth()+1)){
    const startsAt=new Date(Math.max(d,from)),endsAt=new Date(Math.min(new Date(d.getFullYear(),d.getMonth()+1,1),to));
    months.push({label:d.toLocaleDateString(locale(),{month:'short',year:'2-digit'}),share:Math.max(0,(endsAt-startsAt)/span*100)});}
  const bar=(item,toneName)=><div className="roadmap-track" key={item.id}><div className="roadmap-spacer" style={{flexBasis:pct(item.start)}}/><a className="roadmap-bar jira-bar" data-tone={toneName} style={{flexBasis:width(item.start,item.end)}} href={`${base}/issues/${item.key}`} title={`${item.key} · ${item.summary} · ${day(item.start)} – ${day(item.end)}`}>{item.key} · {item.summary}</a></div>;
  return <><h1>{t('Timeline')}</h1><p className="jira-empty">{day(data.start)} – {day(data.end)} · {t('Bars are derived only from exported start and due dates')}{data.startFieldName?t(' (start field “{field}”)',{field:data.startFieldName}):''}.</p>
    <div className="roadmap-chart"><div className="roadmap-months">{months.map((m,i)=><div className="roadmap-month" key={i} style={{flexBasis:`${m.share}%`,flexGrow:m.share}}>{m.label}</div>)}</div>
      <div className="roadmap-body">{data.releases.filter(r=>r.date).map(r=><div className="roadmap-marker" key={r.id} style={{left:pct(r.date)}}><span className="roadmap-marker-label">{r.name}</span></div>)}
        {data.lanes.map(lane=><div className="roadmap-lane" key={lane.id}><p className="roadmap-lane-title"><a href={`${base}/issues/${lane.key}`}>{lane.key} · {lane.summary}</a>{lane.derived&&<span className="jira-empty"> · {t('Period derived from child issues')}</span>}</p>{bar(lane,'purple')}{lane.children.map(c=>bar(c,c.statusCategory==='3'?'green':'blue'))}</div>)}
        {!!data.loose.length&&<div className="roadmap-lane"><p className="roadmap-lane-title">{t('Without parent epic')}</p>{data.loose.map(i=>bar(i,i.statusCategory==='3'?'green':'blue'))}</div>}
      </div></div>
    {!!data.sprints.length&&<><h2>{t('Sprints')}</h2><RecordTable items={data.sprints.map(s=>({...s,start:day(s.start),end:day(s.end),closed:s.closed?t('Completed'):t('Active')}))} columns={[['name',t('Sprint')],['start',t('Start')],['end',t('End')],['closed',t('State')]]}/></>}
    {!!data.undated.length&&<><h2>{t('Without period in the export')} <span className="count-badge">{data.undated.length}</span></h2>{data.undated.map(i=><IssueRow key={i.id} item={i} base={base}/>)}</>}</>;
}
function Summary({data,base,project}) {
  const total=data.statusCounts.reduce((a,s)=>a+s.count,0)||1;
  const buckets=[['4',t('In progress')],['3',t('Done')]].map(([c,label])=>({label,count:data.statusCounts.filter(s=>String(s.category)===c).reduce((a,s)=>a+s.count,0),category:c}));
  buckets.unshift({label:t('To do'),category:'2',count:total-buckets.reduce((a,b)=>a+b.count,0)});
  return <><h1>{project.name}</h1><p className="jira-empty">{project.key} · {projectType(project.projecttype)} · {t('{n} visible issues',{n:num(data.total)})}</p>
    <div className="jira-summary-grid">
      <section><h2>{t('Status overview')}</h2><div className="jira-meter" role="img" aria-label={buckets.map(b=>`${b.label}: ${b.count}`).join(', ')}>{buckets.filter(b=>b.count>0).map(b=><span key={b.category} data-category={b.category} style={{flexGrow:b.count}}/>)}</div>
        <ul className="jira-legend">{buckets.map(b=><li key={b.category}><span className="jira-dot" data-category={b.category}/>{b.label} <strong>{num(b.count)}</strong></li>)}</ul>
        <RecordTable items={data.statusCounts.map(s=>({...s,count:num(s.count)}))} columns={[['name',t('Status')],['count',t('Issues')]]}/></section>
      <section><h2>{t('Issue types')}</h2><ul className="jira-legend">{data.typeCounts.map(ty=><li key={ty.id}><TypeIcon type={ty.name}/>{ty.name} <strong>{num(ty.count)}</strong></li>)}</ul>
        <h2>{t('Assignee')}</h2><ul className="jira-legend">{data.assigneeCounts.map(a=><li key={a.id||'none'}><Avatar name={a.name}/>{a.name} <strong>{num(a.count)}</strong></li>)}</ul></section>
    </div>
    <h2>{t('Recently updated')}</h2>{data.recent.map(i=><IssueRow key={i.id} item={i} base={base}/>)}
    {!!data.versions.length&&<><h2>{t('Open releases')}</h2><RecordTable items={data.versions.map(v=>({...v,releasedate:day(v.releasedate),released:v.released==='true'?t('Released'):t('Pending')}))} columns={[['name',t('Version')],['released',t('Status')],['releasedate',t('Date')]]}/></>}</>;
}
function Releases({data}) {return <><h1>{t('Releases')}</h1><div className="table-scroll"><table className="data-table"><thead><tr><th>{t('Version')}</th><th>{t('Status')}</th><th>{t('Start')}</th><th>{t('Release')}</th><th>{t('Description')}</th></tr></thead><tbody>{data.versions.map(v=><tr key={v.id}><td>{v.name}</td><td><Lozenge appearance={v.released==='true'?'success':v.archived==='true'?'default':'inprogress'}>{v.released==='true'?t('Released'):v.archived==='true'?t('Archived'):t('Not released')}</Lozenge></td><td>{v.startdate?day(v.startdate):'–'}</td><td>{v.releasedate?day(v.releasedate):'–'}</td><td>{v.description||'–'}</td></tr>)}</tbody></table>{!data.versions.length&&<p className="jira-empty">{t('No versions in the export.')}</p>}</div></>;}
function Components({data}) {return <><h1>{t('Components')}</h1><RecordTable items={data.components.map(c=>({...c,lead:c.lead||t('No lead')}))} columns={[['name',t('Component')],['description',t('Description')],['lead',t('Lead')]]}/></>;}
function ProjectSettings({data,base}) {
  return <><h1>{t('Project settings')}</h1><p className="jira-empty">{t('Archived configuration. It is visible here only and cannot be changed.')}</p>
    <h2>{t('Details')}</h2><dl className="jira-detail-list"><Detail label={t('Name')}>{data.name}</Detail><Detail label={t('Key')}>{data.key}</Detail><Detail label={t('Type')}>{projectType(data.projecttype)}</Detail><Detail label={t('Project lead')}><User name={data.lead}/></Detail></dl><Html html={data.descriptionHtml}/>
    <h2>{t('Issue types and workflows')}</h2><RecordTable items={data.workflow} columns={[['issuetypeName',t('Issue type')],['workflow',t('Workflow')]]}/>
    <h2>{t('Roles')}</h2><RecordTable items={data.roles} columns={[['name',t('Role')],['description',t('Description')],['actors',t('Members')]]}/>
    <h2>{t('Permissions')}</h2><RecordTable items={data.permissions} columns={[['permissionkey',t('Permission')],['type',t('Rule')],['parameter',t('Principal')]]}/>
    <h2>{t('Issue security')}</h2><RecordTable items={data.issueSecurity} columns={[['name',t('Security level')],['description',t('Description')]]}/>
    {data.boards.map(b=><section key={b.id}><h2>{t('Board “{name}”',{name:b.name})}</h2><p className="jira-empty">{t('Stored filter:')} <code>{b.filter?.request||t('Not in the export')}</code></p>
      <h3>{t('Columns')}</h3><RecordTable items={b.columns.map(c=>({...c,name:columnName(c.name),statuses:c.statuses}))} columns={[['name',t('Column')],['statuses',t('Status')],['maxim',t('Maximum')]]}/>
      <h3>{t('Swimlanes')}</h3><RecordTable items={b.swimlanes.map(s=>({...s,query:s.long_query||s.query||t('Default swimlane')}))} columns={[['name',t('Swimlane')],['query',t('Query')]]}/>
      <h3>{t('Quick filter')}</h3><RecordTable items={b.quickFilters.map(q=>({...q,query:q.long_query||q.query}))} columns={[['name',t('Quick filter')],['query',t('Query')]]}/>
      <h3>{t('Sprint archive')}</h3><RecordTable items={b.sprints.map(s=>({...s,state:s.closed==='true'?t('Completed'):s.started==='true'?t('Started'):t('Planned')}))} columns={[['name',t('Sprint')],['goal',t('Goal')],['state',t('State')]]}/></section>)}
    {!!data.queues.length&&<><h2>{t('Queues')}</h2><RecordTable items={data.queues} columns={[['name',t('Queue')],['jql',t('Filter')]]}/></>}
    {!!data.requestTypes.length&&<><h2>{t('Request types')}</h2><RecordTable items={data.requestTypes} columns={[['name',t('Request type')],['portal',t('Channel')]]}/></>}
    {!!data.slaGoals.length&&<><h2>{t('SLA goals')}</h2><RecordTable items={data.slaGoals.map(m=>({...m,goals:m.goals.map(g=>g.jql||g.goal||'').filter(Boolean).join(' · ')}))} columns={[['name',t('Metric')],['goals',t('Goals')]]}/></>}</>;
}
function DetailView({view,data,base,api,portal,route,navigate}) {
  if(view==='issues'||view==='requests')return <Issue data={data} base={base} api={api} portal={portal}/>;
  if(view==='boards')return <Board data={data} base={base} route={route} navigate={navigate}/>;
  if(view==='queues')return <><h1>{data.name}</h1>{data.unavailable?<Message title={t('Queue cannot be evaluated')}>{t(data.unavailable)}</Message>:<><IssueTable items={data.items} columns={data.columns} base={base}/><Pagination data={data} route={route} navigate={navigate}/></>}</>;
  if(view==='portals')return <><h1>{data.name}</h1><Html html={data.descriptionHtml}/><a href={`${base}/${portal?'requests':'search'}?project=${data.project_id}`}>{t('View requests')}</a>{data.groups.map(g=><section key={g.id}><h2>{g.group_name}</h2><div className="jira-link-list">{data.types.filter(ty=>g.types.includes(ty.id)).map(ty=><a key={ty.id} href={`${base}/request-types/${ty.id}`}>{ty.name}</a>)}</div></section>)}<h2>{t('All request types')}</h2><LinkList data={data.types} view="request-types" base={base}/></>;
  if(view==='request-types')return <><h1>{data.name}</h1><Html html={data.descriptionHtml}/><Html html={data.introHtml}/><Message title={t('Archived form view')}>{t('Requests cannot be created or changed in this backup.')}</Message><form className="jira-form">{data.fields.map(f=><label key={f.id}>{f.label||f.field_id}{f.required==='true'?` (${t('required')})`:''}<textarea readOnly disabled rows={2} value={f.values.map(v=>v.value_v2||v.value).join(', ')} /><span>{f.description}</span></label>)}<Button isDisabled>{t('Send request')}</Button></form></>;
  if(view==='dashboards')return <><h1>{data.pagename}</h1><div className="jira-dashboard">{data.gadgets.map(g=><section key={g.id}><h2>{g.title||t('Archived gadget')}</h2>{g.unavailable?<Message title={t('Gadget not available')}>{t(g.unavailable)}</Message>:<IssueTable items={g.result.items} base={base}/>}</section>)}</div></>;
  if(view==='reports')return <><h1>{data.name}</h1>{data.series.map(s=><section key={s.id}><h2>{s.series_label}</h2>{s.unavailable?<Message title={t('Data series cannot be reconstructed')}>{t(s.unavailable)}</Message>:<p>{t('{n} issues.',{n:num(s.snapshotCount)})} {t(s.notice)}</p>}</section>)}</>;
  return <Message title={t('View not available')}>{t('This direct link does not match any archived view.')}</Message>;
}
function Collection({view,data,base}) {
  if(view==='projects')return <div className="jira-link-list jira-projects">{data.map(p=><a key={p.id} aria-label={p.name} href={`${base}/projects/${p.key||p.id}/summary`}><span className="jira-project-avatar" data-tone={tone(p.key)}>{String(p.key||p.name)[0]}</span><span className="jira-project-name"><strong>{p.name}</strong><span className="jira-empty">{p.key} · {projectType(p.projecttype)}</span></span><span className="jira-empty">{t('{n} issues',{n:num(p.count)})}</span></a>)}{!data.length&&<Message title={t('No project access')}>{t('No projects are shared with this Jira identity. Customers can read their requests in the customer portal.')}</Message>}</div>;
  if(view==='customers')return <><h2>{t('Customers from visible requests')}</h2><RecordTable items={data.customers} columns={[['name',t('Name')],['id',t('Jira key')]]}/><h2>{t('Organizations')}</h2><RecordTable items={data.organizations} columns={[['name',t('Name')],['members',t('Members')]]}/></>;
  if(view==='reports')return <><p>{t(data.notice)}</p><h2>{t('Issues by status')}</h2><RecordTable items={data.statusCounts} columns={[['name',t('Status')],['count',t('Visible issues')]]}/><h2>{t('Service management reports')}</h2><LinkList data={data.reports} view="reports" base={base}/></>;
  if(view==='configuration')return <><p>{t(data.notice)}</p><div className="jira-link-list">{data.projects.map(p=><a key={p.id} href={`${base}/projects/${p.key||p.id}/settings`}><strong>{p.name}</strong><span>{p.key} · {t('Project settings')}</span></a>)}</div></>;
  if(view==='report')return <><p>{t('Archive state:')} {date(data.archiveDate)} · {t('Imported:')} {date(data.importedAt)}</p><RecordTable items={Object.entries(data.counts).filter(([k])=>['projects','issues','boards','serviceDesks','queues','files'].includes(k)).map(([name,count])=>({name,count}))} columns={[['name',t('Data type')],['count',t('Imported')]]}/><h2>{t('Import notices ({n})',{n:data.warnings.length})}</h2><RecordTable items={data.warnings} columns={[['id',t('ID')],['message',t('Notice')]]}/><details><summary>{t('Export tables not imported')}</summary><p>{t('Technical settings, credentials and unsupported app data are not indexed.')}</p><RecordTable items={Object.entries(data.skipped).map(([name,count])=>({name,count}))} columns={[['name',t('Table')],['count',t('Records')]]}/></details></>;
  return <LinkList data={data} view={view} base={base}/>;
}
const projectNav=p=>{const jsm=p.projecttype==='service_desk',board=p.boards?.length;
  return [['summary',t('Summary')],...(jsm?[['queues',t('Queues')],['customers',t('Customers')],['portals',t('Channels')],['request-types',t('Request types')]]:[]),
    ...(jsm?[]:[['timeline',t('Timeline')]]),...(board?[['backlog',t('Backlog')],['board','Board']]:[]),
    ['issues',t('Issues')],['releases',t('Releases')],['components',t('Components')],['reports',t('Reports')]];};
export function JiraApp({route,navigate,backups,me,identity}) {
  const segments=route.pathname.split('/').filter(Boolean),backupId=segments[2],portal=segments[3]==='portal';
  const rest=segments.slice(portal?4:3);
  const view=rest[0]||(portal?'portals':'projects'),id=rest[1];
  const projectKey=!portal&&view==='projects'&&id?id:null,projectView=projectKey?(rest[2]||'summary'):null,projectId=rest[3];
  const backup=backups.data?.find(b=>b.id===backupId),base=`/jira/b/${backupId}${portal?'/portal':''}`,api=`/api/backups/${backupId}/jira${portal?'/portal':''}`;
  const live=backup?.product==='jira'&&!backup.error;
  const project=useResource(live&&projectKey?`${api}/projects/${encodeURIComponent(projectKey)}`:null);
  const boardId=route.searchParams.get('board')||project.data?.boards?.[0]?.id;
  const params=new URLSearchParams(route.search);params.delete('board');
  const projectUrl=()=>{
    if(['releases','components','issues'].includes(projectView))return null;
    if(['summary','settings','timeline'].includes(projectView))return `${api}/projects/${encodeURIComponent(projectKey)}/${projectView}`;
    if(projectView==='board'||projectView==='backlog'){if(!boardId)return null;params.set('limit','500');return `${api}/boards/${boardId}?${params}`;}
    return `${api}/${projectView}${projectId?`/${encodeURIComponent(projectId)}`:''}?${params}`;
  };
  const globalUrl=()=>view==='assets'||view==='search'||view==='requests'&&!id?null:`${api}/${view}${id?`/${encodeURIComponent(id)}`:''}${route.search}`;
  const resource=useResource(live?(projectKey?projectUrl():globalUrl()):null);
  const navigation=portal?['portals','requests']:['projects','search','boards','filters','dashboards','assets',...(me.isAdmin?['report']:[])];
  const projectScoped=list=>project.data?list.filter(x=>!x.project_id||x.project_id===project.data.id):list;
  const content=()=>{
    if(view==='assets')return portal?<Message title={t('View not available')}>{t('This view is not available in the customer portal.')}</Message>:<><h1>Assets</h1><p>{t('No Assets data is available for this archive yet.')}</p><a href={`${base}/projects`}>{t('To the project overview')}</a></>;
    if(!projectKey)return view==='search'||view==='requests'&&!id?<Search key={`${api}/${route.search}`} route={route} navigate={navigate} base={base} api={api} portal={portal}/>
      :<State resource={resource}>{resource.data&&(id?<DetailView key={`${api}/${view}/${id}`} view={view} data={resource.data} base={base} api={api} portal={portal} route={route} navigate={navigate}/>:<><h1>{title[view]||'Jira'}</h1><Collection view={view} data={resource.data} base={base}/></>)}</State>;
    return <State resource={project}>{project.data&&(
      projectView==='issues'?<Search key={`${api}/${projectKey}/issues${route.search}`} route={route} navigate={navigate} base={base} api={api} scope={project.data} heading={t('Issues')}/>
      :projectView==='releases'?<Releases data={project.data}/>
      :projectView==='components'?<Components data={project.data}/>
      :(projectView==='board'||projectView==='backlog')&&!boardId?<Message title={t('No board in the export')}>{t('The backup contains no board for this project.')}</Message>
      :<State resource={resource}>{resource.data&&(
        projectView==='summary'?<Summary data={resource.data} base={base} project={project.data}/>
        :projectView==='settings'?<ProjectSettings data={resource.data} base={base}/>
        :projectView==='timeline'?<Timeline data={resource.data} base={base}/>
        :projectView==='board'?<Board data={resource.data} base={base} route={route} navigate={navigate}/>
        :projectView==='backlog'?<Backlog data={resource.data} base={base} route={route} navigate={navigate}/>
        :projectId?<DetailView key={`${api}/${projectView}/${projectId}`} view={projectView} data={resource.data} base={base} api={api} route={route} navigate={navigate}/>
        :<><h1>{title[projectView]||projectView}</h1><Collection view={projectView} data={Array.isArray(resource.data)?projectScoped(resource.data):resource.data} base={base}/></>)}</State>)}</State>;
  };
  return <><a className="skip-link" href="#main">{t('Skip to content')}</a><Header name={portal?t('Service Management · Customer portal'):'Jira'} me={me} identity={identity}/>
    <div className={`jira-layout ${portal?'jira-portal':''}`}><aside className="jira-sidebar">
      {projectKey&&project.data?<><div className="jira-project-head"><span className="jira-project-avatar" data-tone={tone(project.data.key)}>{String(project.data.key||project.data.name)[0]}</span><span className="jira-project-name"><strong>{project.data.name}</strong><span className="jira-empty">{projectType(project.data.projecttype)}</span></span></div>
        <nav aria-label={t('Project navigation')}>{projectNav(project.data).map(([v,label])=><a key={v} className={projectView===v?'selected':''} aria-current={projectView===v?'page':undefined} href={`${base}/projects/${projectKey}/${v}`}>{label}</a>)}</nav>
        <a className={`jira-settings-link ${projectView==='settings'?'selected':''}`} href={`${base}/projects/${projectKey}/settings`}><SettingsIcon label=""/>{t('Project settings')}</a>
        <a className="jira-back-link" href={`${base}/projects`}>{t('All projects')}</a></>
      :<><label>{t('Active Jira backup')}<select aria-label={t('Select Jira backup')} value={backupId} onChange={e=>navigate(`/jira/b/${e.target.value}/${portal?'portal/portals':'projects'}`)}>{backups.data?.filter(b=>b.product==='jira').map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <nav aria-label={portal?t('Customer portal navigation'):t('Jira navigation')}>{navigation.map(v=><a key={v} className={view===v?'selected':''} aria-current={view===v?'page':undefined} href={`${base}/${v}`}>{title[v]}</a>)}</nav></>}
      <a href={`/jira/b/${backupId}/${portal?'projects':'portal/portals'}`}>{portal?t('To the agent view'):t('To the customer portal')}</a><p>{t('The original ZIP stays untouched.')}</p></aside>
    <main id="main" tabIndex={-1} className="jira-main"><div className="jira-archive"><ArchiveIcon label={t('Archive')}/><span>{t('Archive state:')} {date(backup?.archiveDate)} · {t('Read only')}</span></div>
      <State resource={backups}>{!me.products?.jira?<Message title={t('Jira is not enabled')}>{t('Administration manages product access.')}</Message>
        :backup?.error?<Message title={t('Backup could not be imported')} error>{t(backup.error)}</Message>
        :!backup?<Message title={t('Backup not found')} error>{t('Pick an available backup under Products.')}</Message>:content()}</State></main></div></>;
}
