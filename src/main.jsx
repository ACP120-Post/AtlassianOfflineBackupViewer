import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Button from '@atlaskit/button/new';
import Lozenge from '@atlaskit/lozenge/new';
import { setGlobalTheme } from '@atlaskit/tokens';
import '@atlaskit/css-reset/dist/bundle.css';
import AdsSearchIcon from '@atlaskit/icon/core/search';
import AdsGridIcon from '@atlaskit/icon/core/app-switcher';
import AdsPageIcon from '@atlaskit/icon/core/page';
import AdsFolderIcon from '@atlaskit/icon/core/folder-closed';
import AdsDatabaseIcon from '@atlaskit/icon/core/database';
import AdsWhiteboardIcon from '@atlaskit/icon/core/whiteboard';
import AdsArchiveIcon from '@atlaskit/icon/core/archive-box';
import AdsClockIcon from '@atlaskit/icon/core/clock';
import AdsInfoIcon from '@atlaskit/icon/core/information';
import AdsChevronIcon from '@atlaskit/icon/core/chevron-right';
import AdsAttachmentIcon from '@atlaskit/icon/core/attachment';
import AdsDownloadIcon from '@atlaskit/icon/core/download';
import AdsShieldIcon from '@atlaskit/icon/core/shield';
import AdsSettingsIcon from '@atlaskit/icon/core/settings';
import AdsExternalIcon from '@atlaskit/icon/core/arrow-up-right';
import AdsArrowIcon from '@atlaskit/icon/core/arrow-right';
import AdsMenuIcon from '@atlaskit/icon/core/menu';
import AdsCloseIcon from '@atlaskit/icon/core/cross';
import AdsTagIcon from '@atlaskit/icon/core/tag';
import './style.css';
import {useResource,Loading,Message,State,Html} from './ui.jsx';
import {JiraApp,ProductHome,PlatformSettings,ProductSwitcher} from './jira.jsx';
import {t,locale,LangSwitcher} from './i18n.jsx';

setGlobalTheme({ colorMode: 'light', light: 'light', dark: 'dark', typography: 'typography' });
const statusNames = { current:t('Published'), draft:t('Drafts'), archived:t('Archived'), deleted:t('Deleted'), all:t('All statuses') };
const typeNames = { PAGE:t('Page'), BLOGPOST:t('Blog post'), FOLDER:t('Folder'), DATABASE:t('Database'), WHITEBOARD:t('Whiteboard'), EMBED:t('Embed'), ATTACHMENT:t('Attachment') };
const number = value => new Intl.NumberFormat(locale()).format(value || 0);
const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString(locale(), { day:'numeric', month:'short', year:'numeric' }) : t('Date unknown');
const bytes = value => value == null ? t('File missing') : value < 1024 ? `${value} B` : value < 1024*1024 ? `${number(Math.round(value/1024))} KB` : `${(value/1024/1024).toLocaleString(locale(),{maximumFractionDigits:1})} MB`;
const pageUrl = (b,id) => `/b/${b}/content/${id}`;
const fileUrl = (b,id) => `/api/backups/${b}/attachments/${id}`;

const icons = {search:AdsSearchIcon, grid:AdsGridIcon, page:AdsPageIcon, folder:AdsFolderIcon, database:AdsDatabaseIcon, whiteboard:AdsWhiteboardIcon, archive:AdsArchiveIcon, clock:AdsClockIcon, info:AdsInfoIcon, chevron:AdsChevronIcon, attachment:AdsAttachmentIcon, download:AdsDownloadIcon, shield:AdsShieldIcon, settings:AdsSettingsIcon, external:AdsExternalIcon, arrow:AdsArrowIcon, menu:AdsMenuIcon, close:AdsCloseIcon, tag:AdsTagIcon};
function Icon({ name }) {
  const Glyph = icons[name] || AdsPageIcon;
  return <span className="ui-icon" aria-hidden="true"><Glyph label=""/></span>;
}
const TypeIcon = ({type,...props}) => <Icon name={type === 'FOLDER' ? 'folder' : type === 'DATABASE' ? 'database' : type === 'WHITEBOARD' ? 'whiteboard' : 'page'} {...props}/>;

function Status({status}) { return <Lozenge appearance={status==='current'?'success':status==='draft'?'information':status==='deleted'?'danger':'neutral'}>{statusNames[status] || status}</Lozenge>; }


// ponytail: switching identity just reloads the page rather than re-fetching
// every open resource — this is a local test tool, not worth a cache-bust scheme.
function IdentitySwitcher({me,setMe}) {
  const [users,setUsers] = useState([]);
  const [busy,setBusy] = useState(false);
  useEffect(()=>{
    fetch('/api/auth/me').then(r=>r.json()).then(setMe);
    if(me?.isAdmin)fetch('/api/auth/users').then(r=>r.json()).then(data=>setUsers(Array.isArray(data)?data:[]));
  },[me?.isAdmin]);
  const switchTo = externalId => {
    setBusy(true);
    fetch('/api/auth/switch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({externalId})})
      .then(()=>window.location.reload());
  };
  if (!me) return <div className="avatar" title={t('Local viewer')}>L</div>;
  // Ohne Lizenz gibt es nur den lokalen Admin – nichts zum Umschalten.
  if(!me.licence?.valid)return <div className="identity-switcher"><span>{me.user?.displayName}</span></div>;
  if(!me.isAdmin)return <div className="identity-switcher"><span>{me.user?.displayName}</span><Button appearance="subtle" onClick={()=>fetch('/api/auth/logout',{method:'POST'}).then(()=>window.location.reload())}>{t('Sign out')}</Button></div>;
  return <div className="identity-switcher">
    <label className="identity-field"><span>{t('Test identity')}</span><select aria-label={t('Select test identity')} value={me.user?.externalId || ''} disabled={busy} onChange={e=>switchTo(e.target.value)}>
      <option value="">{t('Anonymous (no user)')}</option>
      {users.map(u=><option key={u.external_id} value={u.external_id}>{u.display_name || u.username}{!u.active?` (${t('inactive')})`:''}</option>)}
    </select></label>
    <div className="avatar" title={me.user?.displayName || t('Anonymous')}>{(me.user?.displayName || 'A').slice(0,1).toUpperCase()}</div>
  </div>;
}

const emptySaml = { idpSsoUrl:'', idpCert:'', issuer:'', callbackUrl:'', identifierFormat:'', groupAttribute:'' };

// The administration session is separate from the central user session.
function useAdminSession() {
  const [state,setState] = useState({loading:true,loggedIn:false,mustChangePassword:false,username:null,error:null});
  const refresh = () => fetch('/api/auth/admin-me').then(r=>r.json()).then(data=>setState({...data,loading:false,error:null}))
    .catch(() => setState(s=>({...s,loading:false,error:t('Server unreachable. Please try again.')})));
  useEffect(()=>{refresh();},[]);
  return {...state,refresh};
}

function AdminLogin({onLoggedIn,connectionError,samlConfigured}) {
  const [form,setForm] = useState({username:'admin',password:''});
  const [error,setError] = useState(connectionError || null);
  const [busy,setBusy] = useState(false);
  const submit = event => {
    event.preventDefault();
    setBusy(true); setError(null);
    fetch('/api/auth/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
      .then(async r => { const data = await r.json(); if(!r.ok) throw new Error(data.error); return data; })
      .then(()=>{onLoggedIn ? onLoggedIn() : window.location.reload();})
      .catch(error=>{setError(error.message);setBusy(false);});
  };
  return <div className="login-page">
    <form className="login-card" onSubmit={submit}>
      <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true"><path fill="#1868db" d="m4 7 5-6c9 7 12 12 19 7l4 7c-11 7-18 2-28-8ZM28 25l-5 6C14 24 11 19 4 24l-4-7c11-7 18-2 28 8Z"/></svg>
      <h1>{t('Log in to Confluence')}</h1>
      <p className="subtitle">{t('Shared backup platform for Confluence and Jira')}</p>
      {error && <Message title={t('Login failed')} error>{t(error)}</Message>}
      <label className="settings-field"><span>{t('Username')}</span><input value={form.username} autoFocus required onChange={e=>setForm({...form,username:e.target.value})}/></label>
      <label className="settings-field"><span>{t('Password')}</span><input type="password" value={form.password} required onChange={e=>setForm({...form,password:e.target.value})}/></label>
      <Button appearance="primary" type="submit" isDisabled={busy}>{t('Log in')}</Button>
      {samlConfigured&&<a href="/auth/saml/login">{t('Log in with central SSO')}</a>}
      <p className="login-hint">{t('Default:')} <code>admin</code> / <code>admin</code>. {t('The password must be changed on first login.')}</p>
    </form>
  </div>;
}

function ChangePasswordForm({forced,onDone}) {
  const [form,setForm] = useState({currentPassword:'',newPassword:'',confirm:''});
  const [error,setError] = useState(null);
  const [busy,setBusy] = useState(false);
  const submit = event => {
    event.preventDefault();
    if (form.newPassword !== form.confirm) return setError(t('The passwords do not match.'));
    setBusy(true); setError(null);
    fetch('/api/auth/admin-change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
      .then(async r => { const data = await r.json(); if(!r.ok) throw new Error(data.error); return data; })
      .then(onDone).catch(error=>{setError(error.message);setBusy(false);});
  };
  return <form onSubmit={submit} className="login-card-inline">
    {forced && <Message title={t('Password change required')}>{t('The default password must be changed before using the backend.')}</Message>}
    {error && <Message title={t('Cannot save')} error>{t(error)}</Message>}
    <label className="settings-field"><span>{t('Current password')}</span><input type="password" value={form.currentPassword} required onChange={e=>setForm({...form,currentPassword:e.target.value})}/></label>
    <label className="settings-field"><span>{t('New password')}</span><input type="password" minLength={8} value={form.newPassword} required onChange={e=>setForm({...form,newPassword:e.target.value})}/></label>
    <label className="settings-field"><span>{t('Confirm new password')}</span><input type="password" minLength={8} value={form.confirm} required onChange={e=>setForm({...form,confirm:e.target.value})}/></label>
    <Button type="submit" appearance="primary" isDisabled={busy}>{t('Change password')}</Button>
  </form>;
}

function LicenceSettings({licence,onChange}) {
  const [key,setKey] = useState('');
  const [error,setError] = useState(null);
  const save = event => {
    event.preventDefault();
    setError(null);
    fetch('/api/auth/licence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})})
      .then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);return data;})
      .then(onChange).catch(e=>setError(e.message));
  };
  const until = licence && new Date(licence.exp).toLocaleDateString(locale());
  return <section>
    <h2>{t('Licence')}</h2>
    {error && <Message title={t('Cannot save')} error>{t(error)}</Message>}
    {licence?.valid
      ? <Message title={t('Licensed for {company}',licence)}>{licence.trial?t('Trial, valid until {date}',{date:until}):t('Valid until {date}',{date:until})}</Message>
      : <Message title={licence?t('Licence expired on {date}',{date:until}):t('No licence key')} error={!!licence}>
          {t('SSO, identity import and per-user permission management require a valid licence. Generate a key with the Forge app in your Atlassian site and paste it here. Global product visibility settings remain available.')}
        </Message>}
    <form onSubmit={save}>
      <label className="settings-field"><span>{t('Licence key')}</span><textarea rows={3} value={key} onChange={e=>setKey(e.target.value)} placeholder={t('Paste licence key')}/></label>
      <Button type="submit">{t('Save')}</Button>
      {licence && <Button appearance="subtle" onClick={()=>{setKey('');fetch('/api/auth/licence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:null})}).then(r=>r.json()).then(onChange);}}>{t('Remove licence')}</Button>}
    </form>
  </section>;
}

function Settings() {
  const [form,setForm] = useState(null);
  const [saved,setSaved] = useState(false);
  const [error,setError] = useState(null);
  const [orphaned,setOrphaned] = useState(null);
  const [users,setUsers] = useState([]);
  const [query,setQuery] = useState('');
  const [importBusy,setImportBusy] = useState(false);
  const [importResult,setImportResult] = useState(null);
  const [licence,setLicence] = useState(undefined);
  const loadUsers = () => fetch('/api/auth/users').then(r=>r.json()).then(data=>setUsers(Array.isArray(data)?data:[]));
  useEffect(()=>{
    fetch('/api/auth/settings').then(async r => { const data = await r.json(); if(!r.ok) throw new Error(data.error); return data; })
      .then(data=>setForm({saml:data.saml || emptySaml}))
      .catch(error=>setError(error.message));
    fetch('/api/auth/orphaned-users').then(r=>r.json()).then(setOrphaned);
    fetch('/api/auth/licence').then(r=>r.json()).then(setLicence);
    loadUsers();
  },[]);
  if (!form || licence===undefined) return <Loading text={t('Loading settings …')}/>;
  const licensed = !!licence?.valid;
  const submit = event => {
    event.preventDefault();
    setSaved(false);
    const complete = Object.values(form.saml).slice(0,4).every(Boolean);
    fetch('/api/auth/settings',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({saml:complete?form.saml:null})})
      .then(async r => { const data = await r.json(); if(!r.ok) throw new Error(data.error); return data; })
      .then(()=>setSaved(true)).catch(error=>setError(error.message));
  };
  const field = (key,label,props={}) => <label className="settings-field"><span>{label}</span><input value={form.saml[key]} onChange={e=>setForm({...form,saml:{...form.saml,[key]:e.target.value}})} {...props}/></label>;
  const filteredUsers = users.filter(u=>`${u.display_name} ${u.username} ${u.email}`.toLowerCase().includes(query.toLowerCase()));
  const logout = () => fetch('/api/auth/admin-logout',{method:'POST'}).then(()=>{window.location.href='/login';});
  const importCsv = event => {
    const file = event.target.files[0];
    if (!file) return;
    setImportBusy(true); setImportResult(null);
    file.text().then(csv => fetch('/api/auth/import-users',{method:'POST',headers:{'Content-Type':'text/csv'},body:csv}))
      .then(async r => { const body = await r.json(); if(!r.ok) throw new Error(body.error); return body; })
      .then(summary => { setImportResult(summary); loadUsers(); })
      .catch(error => setError(error.message))
      .finally(() => { setImportBusy(false); event.target.value = ''; });
  };
  return <>
    <div className="page-title-row"><h1>{t('Settings')}</h1><Button appearance="subtle" onClick={logout}>{t('Sign out')}</Button></div>
    <p className="subtitle">{t('SSO, user directory and orphaned users for this local viewer. Login is mandatory for all content. Changes take effect immediately, without a restart.')}</p>
    {error && <Message title={t('Not possible')} error>{t(error)}</Message>}
    {saved && <Message title={t('Saved')}>{t('The settings have been applied.')}</Message>}
    <LicenceSettings licence={licence} onChange={()=>window.location.reload()}/>
    {!licensed && <Message title={t('Licence required')}>{t('SSO, identity import and per-user permission management require a valid licence key. Without one, only the local administrator is signed in and sees all content without per-user filtering.')}</Message>}
    {licensed && <form onSubmit={submit}>
      <h2>SAML SSO</h2>
      {field('idpSsoUrl',t('IdP SSO URL'),{required:true})}
      {field('issuer',t('Issuer'),{required:true})}
      {field('callbackUrl',t('Callback URL'),{required:true})}
      {field('identifierFormat',t('Identifier format (optional)'))}
      {field('groupAttribute',t('Group attribute (optional)'))}
      <label className="settings-field"><span>{t('IdP certificate')}</span><textarea rows={6} value={form.saml.idpCert} onChange={e=>setForm({...form,saml:{...form.saml,idpCert:e.target.value}})}/></label>
      <Button type="submit">{t('Save')}</Button>
    </form>}
    <PlatformSettings users={users} licensed={licensed}/>
    <h2>{t('User directory')}</h2>
    {licensed && <div className="settings-import-row">
      <label className="button-like-input">
        <Icon name="archive"/>
        <span>{importBusy?t('Importing …'):t('Import Guard user export (CSV)')}</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" disabled={importBusy} onChange={importCsv}/>
      </label>
      {importResult && <span className="muted">{t('{imported} imported, {skipped} skipped, {deactivated} deactivated.',importResult)}</span>}
    </div>}
    <label className="filter-field" style={{maxWidth:'22.5rem'}}><span>{t('Search users')}</span><div className="filter-input"><Icon name="search"/><input aria-label={t('Search users')} placeholder={t('Name or email')} value={query} onChange={e=>setQuery(e.target.value)}/></div></label>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('Name')}</th><th>{t('Username')}</th><th>{t('Email')}</th><th>{t('Groups')}</th><th>{t('Status')}</th></tr></thead>
      <tbody>{filteredUsers.map(u=><tr key={u.external_id}><td>{u.display_name}</td><td>{u.username}</td><td>{u.email}</td><td>{u.groups.join(', ')}</td><td>{u.active?t('Active'):t('Inactive')}</td></tr>)}</tbody></table></div>
    {!filteredUsers.length && <Message title={t('No users found')}>{t('Use the import button above to import a Guard user export (CSV).')}</Message>}
    <h2>{t('Orphaned users')} <span className="count-badge">{orphaned?.length ?? ''}</span></h2>
    <p className="subtitle">{t('Users that appear in a backup but are not part of the imported user directory.')}</p>
    <State resource={{data:orphaned,error:null,loading:orphaned===null}}>{orphaned && (orphaned.length
      ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('ID')}</th><th>{t('Name')}</th><th>{t('Backup(s)')}</th></tr></thead>
          <tbody>{orphaned.map(o=><tr key={o.id}><td>{o.id}</td><td>{o.name || '–'}</td><td>{o.backups.join(', ')}</td></tr>)}</tbody></table></div>
      : <Message title={t('No orphaned users')}>{t('All backup users are known in the directory.')}</Message>)}</State>
  </>;
}

function App() {
  const [location,setLocation] = useState(window.location.pathname+window.location.search+window.location.hash);
  const navigate = (href,replace=false) => { window.history[replace?'replaceState':'pushState']({},'',href); setLocation(window.location.pathname+window.location.search+window.location.hash); if(!href.includes('#'))window.scrollTo(0,0); };
  useEffect(()=>{
    const pop=()=>setLocation(window.location.pathname+window.location.search+window.location.hash);
    const click=event=>{
      const a=event.target.closest('a');
      if(!a || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || a.target || a.hasAttribute('download'))return;
      const url=new URL(a.href);
      if(url.origin===window.location.origin && ((url.pathname.startsWith('/b/') || url.pathname.startsWith('/jira/')) || url.pathname==='/' || url.pathname==='/settings' || url.pathname==='/login')){event.preventDefault();navigate(url.pathname+url.search+url.hash);}
    };
    window.addEventListener('popstate',pop); document.addEventListener('click',click);
    return ()=>{window.removeEventListener('popstate',pop);document.removeEventListener('click',click);};
  },[]);
  const route = new URL(location,window.location.origin), segments = route.pathname.split('/').filter(Boolean);
  const backups = useResource('/api/backups');
  const backupId = segments[0]==='b' ? segments[1] : segments[0]==='jira'&&segments[1]==='b'?segments[2]:backups.data?.find(b=>b.product==='confluence'&&!b.error)?.id;
  const backup = backups.data?.find(b=>b.id===backupId);
  const base = `/b/${backupId}`;
  const view = segments[2] || 'spaces', contentId = view==='content'?segments[3]:null;
  const spaces = useResource(backup?.product==='confluence' && !backup.error ? `/api/backups/${backupId}/spaces` : null);
  const content = useResource(contentId && backup?.product==='confluence' && !backup.error ? `/api/backups/${backupId}/content/${contentId}` : null);
  const [lastScope,setLastScope] = useState({backup:null,space:''});
  const explicitSpace = view==='spaces'?segments[3]:content.data?.space_id || route.searchParams.get('space');
  const spaceId = explicitSpace || (lastScope.backup===backupId?lastScope.space:'');
  useEffect(()=>{ if(explicitSpace)setLastScope({backup:backupId,space:explicitSpace}); },[backupId,explicitSpace]);
  const space = spaces.data?.find(s=>s.id===spaceId);
  const status = route.searchParams.get('status') || 'current';
  const tree = useResource(backup?.product==='confluence' && !backup.error && spaceId ? `/api/backups/${backupId}/tree?space=${spaceId}&status=${status}`:null);
  const [search,setSearch] = useState('');
  const [mobileNav,setMobileNav]=useState(false);
  useEffect(()=>{
    if(!mobileNav)return;
    const close=event=>{if(event.key==='Escape'){setMobileNav(false);document.querySelector('.nav-toggle')?.focus();}};
    document.addEventListener('keydown',close);
    return ()=>document.removeEventListener('keydown',close);
  },[mobileNav]);
  useEffect(()=>{setMobileNav(false);},[location]);
  useEffect(()=>{
    if(!route.hash)return;
    let id;try{id=decodeURIComponent(route.hash.slice(1));}catch{return;}
    requestAnimationFrame(()=>{const target=document.getElementById(id);target?.scrollIntoView({block:'start'});if(id==='main')target?.focus({preventScroll:true});});
  },[location,content.data]);
  const filterStatus = next => { const url = new URL(location,window.location.origin); url.searchParams.set('status',next); navigate(url.pathname+url.search); };
  const searchSubmit = event => {event.preventDefault();navigate(`${base}/search?q=${encodeURIComponent(search)}`);};
  const [me,setMe] = useState(null);
  const admin = useAdminSession();
  useEffect(()=>{fetch('/api/auth/me').then(r=>r.json()).then(setMe);},[]);
  if (admin.loading) return <div className="login-page"><Loading text={t('Loading …')}/></div>;
  if(!me)return <Loading/>;
  if ((!admin.loggedIn&&!me.user)||(route.pathname==='/settings'&&!admin.loggedIn)) return <AdminLogin onLoggedIn={()=>window.location.reload()} connectionError={admin.error} samlConfigured={me.samlConfigured}/>;
  if (admin.mustChangePassword) return <div className="login-page"><div className="login-card"><h1>{t('Change password')}</h1><p className="subtitle">{t('Shared backup platform for Confluence and Jira')}</p><ChangePasswordForm forced onDone={()=>window.location.reload()}/></div></div>;
  if(route.pathname==='/')return <ProductHome backups={backups} me={me} identity={<IdentitySwitcher me={me} setMe={setMe}/>}/>;
  if(segments[0]==='jira')return <JiraApp route={route} navigate={navigate} backups={backups} me={me} identity={<IdentitySwitcher me={me} setMe={setMe}/>}/>;
  if (route.pathname === '/settings') return <>
    <a className="skip-link" href="#main">{t('Skip to content')}</a>
    <header className="topbar">
      <a className="brand" href={backupId?`${base}/spaces`:'/'} aria-label={t('Confluence backup viewer – spaces')}><svg width="29" height="28" viewBox="0 0 32 32" aria-hidden="true"><path fill="#1868db" d="m4 7 5-6c9 7 12 12 19 7l4 7c-11 7-18 2-28-8ZM28 25l-5 6C14 24 11 19 4 24l-4-7c11-7 18-2 28 8Z"/></svg><span>Confluence</span></a>
      <ProductSwitcher me={me}/><span className="local-badge">{t('Local')}</span>
      <LangSwitcher/><IdentitySwitcher me={me} setMe={setMe}/>
    </header>
    <main id="main" tabIndex={-1} className="overview-main"><Settings/></main>
  </>;
  return <>
    <a className="skip-link" href="#main">{t('Skip to content')}</a>
    <header className="topbar">
      <button className="nav-toggle icon-button" onClick={()=>setMobileNav(!mobileNav)} aria-label={t('Open navigation')} aria-controls="sidebar" aria-expanded={mobileNav}><Icon name={mobileNav?'close':'menu'}/></button>
      <a className="brand" href={backupId?`${base}/spaces`:'/'} aria-label={t('Confluence backup viewer – spaces')}><svg width="29" height="28" viewBox="0 0 32 32" aria-hidden="true"><path fill="#1868db" d="m4 7 5-6c9 7 12 12 19 7l4 7c-11 7-18 2-28-8ZM28 25l-5 6C14 24 11 19 4 24l-4-7c11-7 18-2 28 8Z"/></svg><span>Confluence</span></a>
      <ProductSwitcher me={me}/><span className="local-badge">{t('Local')}</span>
      <form className="global-search" onSubmit={searchSubmit}><label htmlFor="global-search-input">{t('Search')}</label><Icon name="search"/><input id="global-search-input" aria-label={t('Search backup')} placeholder={t('Search this backup')} value={search} onChange={e=>setSearch(e.target.value)} disabled={!backup || !!backup.error}/><button className="icon-button search-submit" type="submit" aria-label={t('Search backup')}><Icon name="arrow"/></button></form>
      <div className="read-only"><Icon name="shield"/><span>{t('Read only')}</span></div>
      <a className="icon-button settings-link" href="/settings" aria-label={t('Settings')} title={t('Settings')}><Icon name="settings"/></a>
      <LangSwitcher/><IdentitySwitcher me={me} setMe={setMe}/>
    </header>
    <div className="app-layout">
      <aside id="sidebar" className={`sidebar ${mobileNav?'mobile-open':''}`} aria-label={t('Backup and page navigation')}>
        <div className="backup-picker"><label htmlFor="backup">{t('Active backup')}</label><div className="backup-input"><Icon name="archive"/><select id="backup" value={backupId || ''} onChange={e=>navigate(`/b/${e.target.value}/spaces`)} aria-label={t('Select backup')}><option value="" disabled>{t('Select backup')}</option>{backups.data?.filter(b=>b.product==='confluence').map(b=><option key={b.id} value={b.id}>{b.name}{b.error?` (${t('Error')})`:''}</option>)}</select></div><span className="backup-caption"><span className="green-dot"/> {t('Available offline · ZIP stays untouched')}</span></div>
        <nav className="primary-nav" aria-label={t('Main navigation')}>
          <a className={view==='spaces'&&!segments[3]?'selected':''} aria-current={view==='spaces'&&!segments[3]?'page':undefined} href={`${base}/spaces`}><Icon name="grid"/>{t('Spaces')}<span>{backup?.counts?.spaces}</span></a>
          <a className={view==='search'?'selected':''} aria-current={view==='search'?'page':undefined} href={`${base}/search`}><Icon name="clock"/>{t('Recently changed')}</a>
          <a className={view==='report'?'selected':''} aria-current={view==='report'?'page':undefined} href={`${base}/report`}><Icon name="archive"/>{t('Backup report')}{backup?.warnings>0&&<span className="warning-dot" aria-label={t('{n} notices',{n:backup.warnings})}/>}</a>
        </nav>
        <div className="sidebar-divider"/>
        {spaces.data?.length>0 && <div className="space-navigation"><label htmlFor="space-nav">{t('Space')}</label><select id="space-nav" aria-label={t('Select space')} value={spaceId || ''} onChange={e=>navigate(`${base}/spaces/${e.target.value}`)}><option value="" disabled>{t('Select space')}</option>{spaces.data.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        {spaceId && <><div className="tree-label"><span>{t('Content')}</span><span>{tree.data?.length ?? ''}</span></div><label className="sr-only" htmlFor="content-status">{t('Content status')}</label><select className="status-select" id="content-status" value={status} onChange={e=>filterStatus(e.target.value)}>{Object.entries(statusNames).map(([key,name])=><option value={key} key={key}>{name}</option>)}</select><State resource={tree}>{tree.data && <PageTree nodes={tree.data} backupId={backupId} active={contentId} ancestors={content.data?.ancestors || []} status={status}/>}</State></>}
        {!spaceId && <div className="sidebar-hint"><Icon name="folder"/><p>{t('Pick a space to explore its pages and folders.')}</p></div>}
        <div className="sidebar-footer"><Icon name="shield"/><div>{t('Your data stays here.')}<small>{t('No connection to Confluence')}</small></div></div>
      </aside>
      <main id="main" tabIndex={-1} className={view==='content'?'page-main':'overview-main'}>
        <State resource={backups}>{backups.data?.length===0 ? <EmptyBackups/> : !backup ? <Message title={t('Backup not found')} error>{t('Pick an existing backup on the left.')}</Message> : backup.error ? <Message title={t('This backup could not be imported')} error>{t(backup.error)}<p>{t('Other backups remain available. Restart the application after replacing the ZIP file.')}</p></Message> : <>
          {view==='content' ? <State resource={content}>{content.data && <Page key={`${backupId}/${contentId}`} data={content.data} backupId={backupId}/>}</State>
          : view==='report' ? <Report backup={backup}/>
          : view==='search' ? <Search key={`${backupId}/${route.search}`} backupId={backupId} params={route.searchParams} spaces={spaces.data || []} navigate={navigate}/>
          : <State resource={spaces}>{spaces.data && <Spaces backup={backup} spaces={spaces.data} selected={segments[3]} tree={tree} status={status}/>}</State>}
        </>}</State>
      </main>
    </div>
  </>;
}

function EmptyBackups() {return <div className="empty-state"><Icon name="archive"/><h1>{t('No backups yet')}</h1><p>{t('Put Confluence ZIP files into')} <code>backups/</code> {t('and restart the application.')}</p><p>{t('A ZIP in the project directory is detected as well.')}</p></div>;}

function PageTree({nodes,backupId,active,ancestors,status}) {
  const [expanded,setExpanded]=useState(new Map());
  const automatic=new Set([...ancestors.map(a=>a.id),active]);
  const {roots,byParent}=useMemo(()=>{
    const byId=new Map(nodes.map(n=>[n.id,n])), byParent=new Map(), roots=[];
    for(const node of nodes){if(!byId.has(node.parent_id)||node.parent_id===node.id)roots.push(node);else{if(!byParent.has(node.parent_id))byParent.set(node.parent_id,[]);byParent.get(node.parent_id).push(node);}}
    const visited=new Set();const mark=n=>{if(visited.has(n.id))return;visited.add(n.id);for(const c of byParent.get(n.id)||[])mark(c);};
    roots.forEach(mark);for(const n of nodes)if(!visited.has(n.id)){roots.push(n);mark(n);}
    return {roots,byParent};
  },[nodes]);
  if(!nodes.length)return <p className="tree-empty">{t('No content for this filter.')}</p>;
  function branch(node,parents=new Set()) {
    if(parents.has(node.id))return null;
    const children=byParent.get(node.id)||[], open=expanded.get(node.id) ?? automatic.has(node.id);
    return <li key={node.id}><div className={`tree-row ${active===node.id?'active':''}`}>
      {children.length?<button aria-label={t(open?'{title}: Unterseiten zuklappen':'{title}: Unterseiten aufklappen',{title:node.title})} aria-expanded={open} onClick={()=>setExpanded(previous=>new Map(previous).set(node.id,!open))} className={`tree-disclosure ${open?'open':''}`}><Icon name="chevron"/></button>:<span className="tree-spacer"/>}
      <a href={`${pageUrl(backupId,node.id)}${status!=='current'?`?status=${status}`:''}`} aria-current={active===node.id?'page':undefined} title={node.title}><TypeIcon type={node.type}/><span>{node.title || typeNames[node.type]}</span>{node.status!=='current'&&<span className="tree-status" title={statusNames[node.status]}>•</span>}</a>
    </div>{children.length>0&&open&&<ul>{children.map(c=>branch(c,new Set([...parents,node.id])))}</ul>}</li>;
  }
  return <nav className="page-tree" aria-label={t('Page tree')}><ul>{roots.map(n=>branch(n))}</ul></nav>;
}

function Spaces({backup,spaces,selected,tree,status}) {
  const [query,setQuery]=useState('');
  const space=spaces.find(s=>s.id===selected);
  if(selected && !space)return <Message title={t('Space not found')} error>{t('This space is not part of the selected backup.')}</Message>;
  if(space)return <>
    <nav className="breadcrumbs"><a href={`/b/${backup.id}/spaces`}>{t('Spaces')}</a><span>/</span><span>{space.name}</span></nav>
    <div className="space-heading"><div className="space-icon large" style={{'--space-color':`var(--ds-text-accent-${spaceColor(spaces.indexOf(space))})`,'--space-background':`var(--ds-background-accent-${spaceColor(spaces.indexOf(space))}-subtler)`}}><Icon name="folder"/></div><div><h1>{space.name}</h1><p className="muted">{t('{n} published items',{n:number(space.count)})} · {space.status==='ARCHIVED'?t('Archived space'):t('From local backup')}</p></div></div>
    {space.homepage&&<a className="home-page-link" href={pageUrl(backup.id,space.homepage)}><Icon name="page"/><div><strong>{t('Open space home page')}</strong><span>{t('Overview and entry point for {name}',{name:space.name})}</span></div><Icon name="chevron"/></a>}
    <div className="section-title"><h2>{t('Content in this space')}</h2><Status status={status}/></div>
    <State resource={tree}>{tree.data?.length ? <div className="content-table">{tree.data.map(n=><a key={n.id} href={pageUrl(backup.id,n.id)}><TypeIcon type={n.type}/><span>{n.title || typeNames[n.type]}</span><small>{typeNames[n.type]}</small></a>)}</div> : <Message title={t('No content for this filter')}>{t('More statuses can be picked in the page tree on the left.')}</Message>}</State>
  </>;
  const filtered=spaces.filter(s=>`${s.name} ${s.key}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <nav className="breadcrumbs"><span>{t('Local knowledge')}</span><span>/</span><span>{t('Spaces')}</span></nav>
    <div className="page-title-row"><div><h1>{t('Spaces')}</h1><p className="subtitle">{t('Spaces and content from your Confluence backup.')}</p></div><Lozenge appearance="success">{t('Available offline')}</Lozenge></div>
    <div className="backup-banner"><div className="banner-icon"><Icon name="archive"/></div><div><strong>{backup.name.replace(/\.zip$/i,'')}</strong><p>{t('Fully local and read-only. State of the imported backup.')}</p></div><a href={`/b/${backup.id}/report`}>{t('Backup report')} <Icon name="external"/></a></div>
    <div className="stats-row"><div><strong>{number(backup.counts.spaces)}</strong><span>{t('Spaces')}</span></div><div><strong>{number(backup.counts.current)}</strong><span>{t('Published content')}</span></div><div><strong>{number(backup.counts.files)}</strong><span>{t('Attachment files')}</span></div><div><strong>{number(backup.counts.versions)}</strong><span>{t('Historical versions')}</span></div></div>
    <div className="section-title"><h2>{t('All spaces')} <span className="count-badge">{filtered.length}</span></h2><label className="filter-field"><span>{t('Filter spaces')}</span><div className="filter-input"><Icon name="search"/><input aria-label={t('Filter spaces')} placeholder={t('Name or space key')} value={query} onChange={e=>setQuery(e.target.value)}/></div></label></div>
    <div className="space-grid">{filtered.map(s=><a className="space-card" href={`/b/${backup.id}/spaces/${s.id}`} key={s.id}><div className="space-card-top"><div className="space-icon" style={{'--space-color':`var(--ds-text-accent-${spaceColor(spaces.indexOf(s))})`,'--space-background':`var(--ds-background-accent-${spaceColor(spaces.indexOf(s))}-subtler)`}}>{s.name.replace(/[^\p{L}\p{N}]/gu,'').slice(0,2).toUpperCase()}</div><Icon name="chevron"/></div><h3>{s.name}</h3><p>{s.key}</p><div className="space-card-footer"><span><Icon name="page"/>{t('{n} items',{n:number(s.count)})}</span>{s.status==='ARCHIVED'?<Lozenge>{t('Archived')}</Lozenge>:<span className="card-open">{t('Open')} <Icon name="arrow"/></span>}</div></a>)}</div>
    {!filtered.length&&<Message title={t('No space found')}>{t('Try a different name or space key.')}</Message>}
    <footer className="overview-footer"><Icon name="shield"/><span>{t('Original files stay untouched. External content is only included if it was stored in the backup.')}</span></footer>
  </>;
}
function spaceColor(index) {return ['blue','purple','green','orange','red','teal'][index%6];}

function Search({backupId,params,spaces,navigate}) {
  const [q,setQ]=useState(params.get('q')||''),[space,setSpace]=useState(params.get('space')||''),[status,setStatus]=useState(params.get('status')||'current');
  const result=useResource(`/api/backups/${backupId}/search?${params}`);
  const label=params.get('label');
  const submit=e=>{e.preventDefault();const next=new URLSearchParams({q,space,status});if(label)next.set('label',label);navigate(`/b/${backupId}/search?${next}`);};
  return <><nav className="breadcrumbs"><a href={`/b/${backupId}/spaces`}>{t('Spaces')}</a><span>/</span><span>{t('Search')}</span></nav><h1>{params.get('q')?t('Search results'):label?t('Label: {label}',{label}):t('Recently changed')}</h1><p className="subtitle">{t('Full-text search in the selected backup, including stored page content.')}</p>
    <form className="search-form" onSubmit={submit}><label className="filter-field"><span>{t('Search term')}</span><div className="filter-input"><Icon name="search"/><input aria-label={t('Search term')} placeholder={t('Search pages and content …')} value={q} onChange={e=>setQ(e.target.value)}/></div></label><label className="filter-field"><span>{t('Space')}</span><select aria-label={t('Search space')} value={space} onChange={e=>setSpace(e.target.value)}><option value="">{t('All spaces')}</option>{spaces.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label className="filter-field"><span>{t('Status')}</span><select aria-label={t('Search status')} value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(statusNames).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><Button appearance="primary" type="submit">{t('Search')}</Button></form>
    {label&&<p>{t('Label filter:')} <span className="label">{label}</span> <a href={`/b/${backupId}/search`}>{t('Remove')}</a></p>}
    <State resource={result}>{result.data&&<><div className="section-title"><h2>{t('{n} results',{n:number(result.data.total)})}</h2><span className="muted">{params.get('q')?t('By relevance'):t('By modification date')}</span></div>{result.data.items.map(item=><article className="search-result" key={item.id}><TypeIcon type={item.type}/><div><a className="result-title" href={pageUrl(backupId,item.id)}>{item.title}</a><div className="result-meta">{item.space_name} <span>·</span> {typeNames[item.type]} <span>·</span> {date(item.modified)} {item.status!=='current'&&<Status status={item.status}/>}</div>{item.snippet&&<p>{item.snippet.split(/(⟦.*?⟧)/g).map((part,i)=>part.startsWith('⟦')?<mark key={i}>{part.slice(1,-1)}</mark>:part)}</p>}</div></article>)}{!result.data.total&&<Message title={t('No results')}>{t('Try fewer search terms, another space or another status.')}</Message>}<div className="pagination">{result.data.offset>0&&<Button onClick={()=>{const p=new URLSearchParams(params);p.set('offset',String(Math.max(0,result.data.offset-50)));navigate(`/b/${backupId}/search?${p}`);}}>{t('Back')}</Button>}{result.data.offset+50<result.data.total&&<Button onClick={()=>{const p=new URLSearchParams(params);p.set('offset',String(result.data.offset+50));navigate(`/b/${backupId}/search?${p}`);}}>{t('More results')}</Button>}</div></>}</State>
  </>;
}

function Page({data,backupId}) {
  const [panel,setPanel]=useState('content');
  const versions=useResource(panel==='versions'?`/api/backups/${backupId}/content/${data.id}/versions`:null);
  const raw=useResource(panel==='raw'?`/api/backups/${backupId}/content/${data.id}/raw`:null);
  const historic=data.id!==data.root_id&&data.status!=='draft';
  return <>
    <nav className="breadcrumbs" aria-label={t('Breadcrumb navigation')}><a href={`/b/${backupId}/spaces`}>{t('Spaces')}</a>{data.space&&<><span>/</span><a href={`/b/${backupId}/spaces/${data.space.id}`}>{data.space.name}</a></>}{data.ancestors.map(a=><React.Fragment key={a.id}><span>/</span><a href={pageUrl(backupId,a.id)}>{a.title}</a></React.Fragment>)}</nav>
    <div className="original-source"><Icon name="page"/>{data.originalUrl?<div><span>{t('Original in Confluence')}{data.id!==data.root_id?` · ${t('Main version')}`:''}</span><a href={data.originalUrl} target="_blank" rel="noopener noreferrer" title={data.originalUrl}>{data.originalUrl} <Icon name="external"/></a></div>:<div><span>{t('Original link unknown')}</span>{data.originalSite?<a href={`${data.originalSite}/wiki`} target="_blank" rel="noopener noreferrer">{t('Open known instance')} <Icon name="external"/></a>:<small>{t('The backup contains no instance address.')}</small>}</div>}</div>
    <div className="page-title-row"><div><h1>{data.title || typeNames[data.type] || t('Untitled')}</h1></div><Status status={data.status}/></div>
    <div className="page-meta"><div className="avatar small">{data.author.slice(0,1).toUpperCase()}</div><span>{t('By')} <strong>{data.author}</strong><br/><span className="muted">{t('Modified on {date}',{date:date(data.modified)})} · {t('Version {n}',{n:data.version})}</span></span></div>
    {historic&&<Message title={t('Historical version {n}',{n:data.version})}><a href={pageUrl(backupId,data.root_id)}>{t('Switch to main version')}</a><p>{t('Comments and the attachment list show the state of the main page in the backup.')}</p></Message>}
    {data.status!=='current'&&<Message title={statusNames[data.status]}>{t('This content is not stored in the backup as a current published page.')}</Message>}
    {data.issues.map((w,i)=><Message key={i} title={t('Notice from the backup')}>{t(w.message)}</Message>)}
    <div className="page-toolbar"><div><Button appearance="subtle" aria-pressed={panel==='content'} onClick={()=>setPanel('content')}>{t('Content')}</Button><Button appearance="subtle" aria-pressed={panel==='versions'} onClick={()=>setPanel('versions')}>{t('Versions')}</Button><Button appearance="subtle" aria-pressed={panel==='raw'} onClick={()=>setPanel('raw')}>{t('Raw data')}</Button></div><span><Icon name="attachment"/>{t('{n} attachments',{n:data.attachments.length})} <span className="toolbar-dot">·</span> {t('{n} comments',{n:data.comments.length})}</span></div>
    {panel==='versions'?<State resource={versions}>{versions.data&&<section><h2>{t('Available versions')}</h2><p className="muted">{t('Only the versions and drafts contained in the ZIP.')}</p><div className="table-scroll"><table className="data-table"><thead><tr><th>{t('Version')}</th><th>{t('Status')}</th><th>{t('Modified')}</th><th>{t('Author / change')}</th></tr></thead><tbody>{versions.data.map(v=><tr key={v.id}><td><a href={pageUrl(backupId,v.id)}>{t('Version {n}',{n:v.version})}{v.current?` (${t('Main version')})`:''}</a></td><td><Status status={v.status}/></td><td>{date(v.modified)}</td><td>{v.author}{v.comment&&<small>{v.comment}</small>}</td></tr>)}</tbody></table></div></section>}</State>
    :panel==='raw'?<State resource={raw}><section><h2>{t('Stored raw data')}</h2><p className="muted">{t('Export record, decoded page content, properties and database/whiteboard export.')}</p><a href={`/api/backups/${backupId}/content/${data.id}/raw`} target="_blank" rel="noreferrer">{t('Open JSON separately')} <Icon name="external"/></a><pre className="raw-data">{JSON.stringify(raw.data,null,2)}</pre></section></State>
    :<>
      {data.type==='DATABASE'&&<Database documents={data.documents}/>}
      {data.type==='WHITEBOARD'&&<><Message title={t('Whiteboard cannot be reconstructed')}>{t('No usable board export was found for this record. Metadata and any stored content are available under “Raw data”.')}</Message>{data.documents.length>0&&<pre className="raw-data">{JSON.stringify(data.documents,null,2)}</pre>}</>}
      {data.html?<Html html={data.html}/>:!['DATABASE','WHITEBOARD','FOLDER'].includes(data.type)&&<Message title={t('No page content stored')}>{t('The backup contains no readable body for this record.')}</Message>}
      {data.children.length>0&&<section className="related-pages"><h2>{data.type==='FOLDER'?t('In this folder'):t('Child pages')}</h2><div className="child-grid">{data.children.map(c=><a href={pageUrl(backupId,c.id)} key={c.id}><TypeIcon type={c.type}/><span>{c.title}</span><Icon name="chevron"/></a>)}</div></section>}
      {data.type==='FOLDER'&&!data.children.length&&<Message title={t('Empty folder')}>{t('No current child pages in the backup.')}</Message>}
      <div className="page-labels"><span>{t('Labels')}</span>{data.labels.length?data.labels.map(label=><a className="label" key={label} href={`/b/${backupId}/search?label=${encodeURIComponent(label)}`}><Icon name="tag"/>{label}</a>):<span className="muted">{t('No labels')}</span>}</div>
      <Attachments files={data.attachments} backupId={backupId}/>
      <section className="comments"><h2>{t('Comments')} <span className="count-badge">{data.comments.length}</span></h2>{data.comments.length?data.comments.map(comment=><article className={`comment ${comment.parentCommentId?'reply':''}`} key={comment.id} id={`comment-${comment.id}`}><div className="avatar small">{comment.author.slice(0,1).toUpperCase()}</div><div className="comment-body"><strong>{comment.author}</strong><span className="comment-date">{date(comment.created)}</span>{comment.parentCommentId&&<p className="reply-label"><a href={`#comment-${comment.parentCommentId}`}>{t('Reply to comment')}</a></p>}<Html html={comment.html}/></div></article>):<p className="muted">{t('No stored comments.')}</p>}</section>
      <div className="page-bottom"><Icon name="shield"/><span>{t('Read mode')} · {t('Created on {date}',{date:date(data.created)})} · {t('Last modified by {name}',{name:data.lastAuthor})}</span></div>
    </>}
  </>;
}

function Database({documents}) {
  if(!documents.length)return <Message title={t('No database export available')}>{t('The content record exists, but the matching table data is missing from the backup.')}</Message>;
  return documents.map((doc,i)=>{
    if(doc.error)return <Message title={t('Database export could not be read')} key={i} error>{t(doc.error)}</Message>;
    const data=doc.data;
    const fields=(data.fields?.length?data.fields:Object.keys(data.fieldsById||{})).map(f=>typeof f==='string'?{id:f,...data.fieldsById?.[f]}:f);
    const entries=(data.entries?.length?data.entries:Object.keys(data.entriesById||{})).map(e=>typeof e==='string'?{id:e,...data.entriesById?.[e]}:e);
    if(!entries.length)return <Message title={t('Empty database export')} key={i}>{t('The database was exported but contains no entries. Views and content from Confluence cannot be restored from it. The stored export is available under “Raw data”.')}</Message>;
    const columns=fields.length?fields:Object.keys(entries[0].values||entries[0]).map(id=>({id,name:id}));
    return <div className="table-scroll" key={i}><table className="data-table"><thead><tr>{columns.map((f,j)=><th key={f.id||j}>{f.name||f.title||f.id}</th>)}</tr></thead><tbody>{entries.map((entry,j)=><tr key={entry.id||j}>{columns.map((f,k)=>{const value=(entry.values||entry)[f.id];return <td key={f.id||k}>{typeof value==='object'?JSON.stringify(value):String(value??'')}</td>;})}</tr>)}</tbody></table></div>;
  });
}

function Attachments({files,backupId}) {
  const [preview,setPreview]=useState(null);
  if(!files.length)return null;
  return <section className="attachments" id="anhaenge"><h2>{t('Attachments')} <span className="count-badge">{files.length}</span></h2><div className="attachment-list">{files.map(file=><div className="attachment-row" key={file.id}><Icon name="attachment"/><div><strong>{file.title}</strong><small>{bytes(file.size)} · {t('Version {n}',{n:file.version})}</small></div>{file.size!=null?<><a className="download-link" href={`${fileUrl(backupId,file.id)}?download`} download><Icon name="download"/><span className="sr-only">{t('Download {name}',{name:file.title})}</span></a>{/\.(png|jpe?g|gif|webp|avif|pdf)$/i.test(file.title)&&<Button appearance="subtle" onClick={()=>setPreview(preview?.id===file.id?null:file)}>{t('Preview')}</Button>}</>:<Lozenge appearance="danger">{t('File missing')}</Lozenge>}</div>)}</div>{preview&&<div className="attachment-preview"><div><strong>{preview.title}</strong><Button appearance="subtle" onClick={()=>setPreview(null)}>{t('Close')}</Button></div>{/\.pdf$/i.test(preview.title)?<iframe title={`PDF: ${preview.title}`} src={fileUrl(backupId,preview.id)}/>:<img alt={preview.title} src={fileUrl(backupId,preview.id)}/>}</div>}</section>;
}

function Report({backup}) {
  const report=useResource(`/api/backups/${backup.id}/report`);
  return <><nav className="breadcrumbs"><a href={`/b/${backup.id}/spaces`}>{t('Spaces')}</a><span>/</span><span>{t('Backup report')}</span></nav><h1>{t('Backup report')}</h1><p className="subtitle">{backup.name}</p><State resource={report}>{report.data&&<>
    <Message title={t('Backup read locally')}>{backup.cached?t('Loaded from the verified SQLite cache.'):t('Re-imported at startup.')} {t('Imported on {date}.',{date:date(report.data.importedAt)})} {t('Original ZIP unchanged.')}</Message>
    <Message title={report.data.siteUrl?t('Original Confluence instance'):t('Original instance unknown')}>{report.data.siteUrl?<a href={`${report.data.siteUrl}/wiki`} target="_blank" rel="noopener noreferrer">{report.data.siteUrl}</a>:t('A confirmed domain can be mapped to the cloud ID in backup-sites.json.')}{report.data.cloudId&&<div>{t('Cloud ID:')} <code>{report.data.cloudId}</code></div>}</Message>
    <div className="stats-row report-stats">{[['spaces',t('Spaces')],['content',t('Content records')],['bodies',t('Body records')],['files',t('Attachment files')],['current',t('Published content')],['versions',t('Historical versions')]].map(([key,label])=><div key={key}><strong>{number(report.data.counts[key])}</strong><span>{label}</span></div>)}</div>
    <h2>{t('Known rendering limits')}</h2><div className="report-limits"><Message title={t('{n} empty database exports',{n:report.data.counts.emptyDatabases})}>{t('The exported databases contain no entries. The original structure is accessible on the respective content pages under “Raw data”.')}</Message><Message title={t('{n} whiteboards without board export',{n:report.data.counts.whiteboardsWithoutExport})}>{t('The content records exist, but no usable board data was included.')}</Message><Message title={t('External content and macros')}>{t('Jira, embedded services and other external macros are shown with their stored parameters and content. External images are not loaded automatically. Arbitrary CQL queries are not executed.')}</Message></div>
    <h2>{t('Import notices')} <span className="count-badge">{report.data.warnings.length}</span></h2>{report.data.warnings.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>{t('Record')}</th><th>{t('Notice')}</th></tr></thead><tbody>{report.data.warnings.map((w,i)=><tr key={i}><td>{w.id?<a href={pageUrl(backup.id,w.id)}>{w.id}</a>:'–'}</td><td>{t(w.message)}</td></tr>)}</tbody></table></div>:<p>{t('No import errors or missing relations found.')}</p>}
    <details className="technical-details"><summary>{t('Technical import details')}</summary><p>{t('Import format version {n}.',{n:report.data.formatVersion})} {t('Technical tables and permission data are not shown as pages.')}</p><ul>{report.data.tables.map(t=><li key={t}><code>{t}</code></li>)}</ul></details>
  </>}</State></>;
}

// ponytail: eigener /me-Fetch statt `me` durch jede Route zu reichen – App hat fünf Rückgabepunkte.
function LicenceBanner() {
  const [licence,setLicence] = useState(undefined);
  useEffect(()=>{fetch('/api/auth/me').then(r=>r.json()).then(d=>setLicence(d.licence));},[]);
  if (licence===undefined || licence?.valid) return null;
  const expired = !!licence;
  return <div className="licence-banner" role="status">
    <span className="ui-icon"><Icon name="shield"/></span>
    <span><strong>{expired?t('Licence expired on {date}',{date:new Date(licence.exp).toLocaleDateString(locale())}):t('No licence key')}</strong>
      {' '}{t('SSO, identity import and per-user permission management are disabled. Only the local administrator is signed in and sees all content without per-user filtering.')}</span>
    <a href="/settings">{t('Enter licence')}</a>
  </div>;
}

createRoot(document.getElementById('root')).render(<><LicenceBanner/><App/><footer className="license-notice"><span>{t('AGPL legal notice')}</span><a href="/LICENSE">{t('View license')}</a></footer></>);
