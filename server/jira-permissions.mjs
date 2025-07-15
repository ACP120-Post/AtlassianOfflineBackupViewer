import { rows, row } from './jira-import.mjs';
export const literal = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const inSet = set => [...set].map(literal).join(',') || "''";
export const parseJson = value => { try { return JSON.parse(value); } catch { return null; } };

export function jiraAccess(backup, identity, identityDb) {
  const db = backup.db;
  const projects = rows(db,'Project');
  // ponytail: unlizenziert gibt es genau einen Nutzer (den Admin) – alles sichtbar, statt die Schemata auszuwerten.
  // `keys` bleibt ein echtes Set (jira-jql spreizt es für currentuser), `groups` braucht nur .has.
  if (identity?.superuser) return { keys: new Set(), groups: { has: () => true }, projects, sql: () => '1',
    canIssue: () => true, canProject: (p, portal = false) => !portal || p.projecttype === 'service_desk',
    canComment: () => true, role: () => true };
  const mappings = identity && identityDb ? identityDb.prepare('SELECT jira_user_key,external_id FROM jira_identity_mappings WHERE backup_id=?').all(backup.id) : [];
  const keys = new Set(), usernames = new Set(), userIds = new Set(), groups = new Set();
  if (identity) {
    const users = db.prepare('SELECT * FROM users WHERE active=1').all();
    for (const u of users) {
      const explicit = mappings.find(m => m.jira_user_key === u.id);
      const matches = explicit ? explicit.external_id === identity.externalId : u.external_id === identity.externalId && users.filter(x => x.external_id === u.external_id).length === 1;
      if (matches) { keys.add(u.id); keys.add(u.username); usernames.add(u.username); }
    }
    for (const u of rows(db,'User')) if (usernames.has(u.username)) userIds.add(u.id);
    for (const m of rows(db,'Membership')) if (m.membershiptype === 'GROUP_USER' && userIds.has(m.childid)) { groups.add(m.parentid); groups.add(m.parentname); }
    const nested = rows(db,'Membership').filter(m => m.membershiptype === 'GROUP_GROUP');
    let changed = true;
    while (changed) { changed = false; for (const m of nested) if (groups.has(m.childid) && !groups.has(m.parentid)) {groups.add(m.parentid);groups.add(m.parentname);changed=true;} }
    for (const g of rows(db,'Group')) if (groups.has(g.id) || groups.has(g.groupname)) { groups.add(g.id); groups.add(g.groupname); if(g.externalid)groups.add(g.externalid); }
  }
  const roles = rows(db,'ProjectRoleActor');
  const role = (project, roleId) => roles.some(r => r.pid === project.id && r.projectroleid === roleId &&
    ((r.roletype === 'atlassian-user-role-actor' && keys.has(r.roletypeparameter)) || (r.roletype === 'atlassian-group-role-actor' && groups.has(r.roletypeparameter))));
  const licenseGroups = rows(db,'LicenseRoleGroup');
  const userSql = inSet(keys);
  const principal = (r, p, portal = false) => {
    if (!keys.size) return '0';
    switch (r.type) {
      case 'user': return keys.has(r.parameter) ? '1' : '0';
      case 'group': return !r.parameter || groups.has(r.parameter) ? '1' : '0';
      case 'projectrole': return role(p,r.parameter) ? '1' : '0';
      case 'applicationRole': return licenseGroups.some(g => (!r.parameter || g.licenserolename === r.parameter) && groups.has(g.groupid)) ? '1' : '0';
      case 'lead': return keys.has(p.lead) ? '1' : '0';
      case 'reporter': return `i.reporter IN (${userSql})`;
      case 'assignee': return `i.assignee IN (${userSql})`;
      case 'userCF': return `EXISTS(SELECT 1 FROM custom_values cv WHERE cv.issue=i.id AND cv.field=${literal((r.parameter||'').replace('customfield_',''))} AND cv.value IN (${userSql}))`;
      case 'groupCF': return `EXISTS(SELECT 1 FROM custom_values cv WHERE cv.issue=i.id AND cv.field=${literal((r.parameter||'').replace('customfield_',''))} AND cv.value IN (${inSet(groups)}))`;
      case 'sd.customer.portal.only': return portal ? '1' : '0';
      default: return '0';
    }
  };
  const grant = (p, permission, portal = false) => {
    if(p.permissionscheme == null || p.permissionscheme === '')return '(0)';
    const rules = rows(db,'SchemePermissions',p.permissionscheme).filter(r => r.permissionkey ? r.permissionkey === permission : permission === 'BROWSE_PROJECTS' && r.permission === '10');
    return `(${rules.map(r => principal(r,p,portal)).join(' OR ') || '0'})`;
  };
  const fields = rows(db,'CustomField');
  const participant = fields.filter(f => f.customfieldtypekey === 'com.atlassian.servicedesk:sd-request-participants').map(f=>f.id);
  const orgFields = fields.filter(f => f.customfieldtypekey === 'com.atlassian.servicedesk:sd-customer-organizations').map(f=>f.id);
  const memberships = rows(db,'OrganizationMember').filter(m => m.is_deleted !== 'true' && keys.has(m.user_key)).map(m=>m.organization_id);
  const portalOwn = `(i.reporter IN (${userSql}) OR EXISTS(SELECT 1 FROM custom_values cv WHERE cv.issue=i.id AND cv.field IN (${inSet(participant)}) AND cv.value IN (${userSql})) OR EXISTS(SELECT 1 FROM custom_values cv WHERE cv.issue=i.id AND cv.field IN (${inSet(orgFields)}) AND cv.value IN (${inSet(memberships)})))`;
  const security = p => {
    const levels = p.issuesecurityscheme ? rows(db,'SchemeIssueSecurityLevels',p.issuesecurityscheme) : [];
    return `(i.security='' OR ${levels.map(l => `(i.security=${literal(l.id)} AND (${rows(db,'SchemeIssueSecurities',l.id).filter(r=>r.scheme===p.issuesecurityscheme).map(r=>principal(r,p)).join(' OR ') || '0'}))`).join(' OR ') || '0'})`;
  };
  const scopes = new Map();
  for (const p of projects) scopes.set(p.id, {
    agent: `(i.project=${literal(p.id)} AND ${grant(p,'BROWSE_PROJECTS')} AND ${p.projecttype === 'service_desk' ? grant(p,'SERVICEDESK_AGENT') : '1'} AND ${security(p)})`,
    portal: p.projecttype === 'service_desk' ? `(i.project=${literal(p.id)} AND ${grant(p,'BROWSE_PROJECTS',true)} AND ${security(p)} AND ${portalOwn} AND EXISTS(SELECT 1 FROM records rt WHERE rt.kind='IssueRequestType' AND rt.parent=i.id))` : '0',
  });
  const sql = (portal = false) => identity && keys.size ? `(${[...scopes.values()].map(s=>portal?s.portal:s.agent).join(' OR ') || '0'})` : '0';
  const canIssue = (id,portal = false) => !!db.prepare(`SELECT 1 FROM issues i WHERE i.id=? AND ${sql(portal)}`).get(id);
  const canProject = (p,portal = false) => !!db.prepare(`SELECT 1 FROM issues i WHERE ${scopes.get(p.id)?.[portal?'portal':'agent'] || '0'} LIMIT 1`).get() || (!portal && keys.size > 0 && db.prepare(`SELECT ${grant(p,'BROWSE_PROJECTS')} AND ${p.projecttype==='service_desk'?grant(p,'SERVICEDESK_AGENT'):'1'} AS allowed FROM (SELECT '' reporter,'' assignee,'' id) i`).get()?.allowed === 1);
  const canComment = (comment,p,portal = false) => {
    if (comment.level && !groups.has(comment.level)) return false;
    if (comment.grouplevel && !groups.has(comment.grouplevel)) return false;
    if (comment.rolelevel && !role(p,comment.rolelevel)) return false;
    if (comment.commentvisibility && !['PUBLIC','NONE','INTERNAL','VISIBLE_TO_HELPSEEKER'].includes(comment.commentvisibility)) {
      const v = parseJson(comment.commentvisibility);
      if (!v || !(v.type === 'group' ? groups.has(v.value) : v.type === 'role' && role(p,v.value))) return false;
    }
    if (!portal) return true;
    if(comment.commentvisibility==='INTERNAL')return false;
    const visibility = rows(db,'EntityProperty',comment.id).filter(r => r.propertykey === 'sd.public.comment').map(r => parseJson(r.value));
    return (visibility.length > 0 || ['PUBLIC','VISIBLE_TO_HELPSEEKER'].includes(comment.commentvisibility)) && visibility.every(v => v && (v.internal === false || v.internal === 'false'));
  };
  return {keys,groups,projects,sql,canIssue,canProject,canComment,role};
}
