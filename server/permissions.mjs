// Read-only permission engine: mirrors the export's space/content permission tables against the
// signed-in (or test-switched) identity. Nothing here ever writes back to a backup or to identity.sqlite.
const all = (db, sql, ...args) => db.prepare(sql).all(...args);

function contentRestrictionRows(db, row) {
  return all(db, "SELECT principal_type,principal_id FROM content_permissions WHERE permission_type='VIEW' AND content_id IN (?,?)", row.id, row.root_id);
}

function spaceViewGrants(db, spaceId) {
  const direct = all(db, "SELECT group_name,username,all_users_subject FROM space_permissions WHERE space_id=? AND perm_type='VIEWSPACE' AND active=1", spaceId || '');
  const viaRole = all(db, `SELECT a.principal_type,a.principal_id FROM space_role_assignments a
    JOIN space_role_permissions p ON p.role_id=a.role_id WHERE a.space_id=? AND p.permission_id='VIEWSPACE'`, spaceId || '');
  return { direct, viaRole };
}

function matchesPrincipal(identity, type, id) {
  if (!identity || !id) return false;
  if (type === 'USER') return id === identity.externalId;
  if (type === 'GROUP') return identity.groups.includes(id);
  return false;
}

// `identity` is either null (anonymous) or { externalId, groups: string[] }.
export function canRead(db, row, spaceId, identity) {
  // Einzelplatz-Modus ohne Lizenz: nur der lokale Admin ist angemeldet, es gibt nichts zu trennen.
  if (identity?.superuser) return { allow: true, reason: 'unlicensed-single-admin' };
  const restrictions = contentRestrictionRows(db, row);
  if (restrictions.length) {
    const allowed = restrictions.some(r => matchesPrincipal(identity, r.principal_type, r.principal_id));
    if (!allowed) return { allow: false, reason: 'restricted-content' };
  }
  const { direct, viaRole } = spaceViewGrants(db, spaceId);
  if (!direct.length && !viaRole.length) return { allow: true, reason: 'no-recorded-space-permissions' };
  const openToAll = direct.some(r => r.all_users_subject);
  if (openToAll) return { allow: true, reason: 'space-open-to-all-users' };
  if (!identity) return { allow: false, reason: 'anonymous-not-permitted' };
  const directMatch = direct.some(r => r.username === identity.externalId || (r.group_name && identity.groups.includes(r.group_name)));
  const roleMatch = viaRole.some(r => matchesPrincipal(identity, r.principal_type, r.principal_id));
  return (directMatch || roleMatch) ? { allow: true, reason: 'space-view-permission' } : { allow: false, reason: 'no-space-view-permission' };
}

// Permission checks are always active and always require a signed-in identity, mirroring
// Confluence Data Center with anonymous access disabled — there is no "off" switch.
export function assertCanRead(db, row, identity) {
  if (!identity) throw Object.assign(new Error('Anmeldung erforderlich'), { status: 401 });
  const decision = canRead(db, row, row.space_id, identity);
  if (!decision.allow) throw Object.assign(new Error('Inhalt ist nicht im ausgewählten Backup enthalten'), { status: 404 });
}
