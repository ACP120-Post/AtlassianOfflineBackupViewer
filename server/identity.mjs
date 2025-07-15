import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Separate from the per-ZIP caches: a new backup must never wipe synced identities,
// and importing identities must never touch the read-only ZIP cache.
export function openIdentityDb(cacheDir) {
  const db = new DatabaseSync(path.join(cacheDir, 'identity.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS identities (
      external_id TEXT PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      email TEXT,
      groups TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      synced_at TEXT NOT NULL,
      raw TEXT NOT NULL
    );
  `);
  return db;
}

const pick = (row, keys) => { for (const k of keys) if (row[k]) return row[k]; return ''; };

// Guard/Atlassian org "export users" CSVs vary by export type; match on common header spellings
// instead of requiring one exact format.
export function importIdentityRows(db, rows, { replace = true } = {}) {
  const now = new Date().toISOString();
  const seen = new Set();
  const upsert = db.prepare(`INSERT INTO identities(external_id,username,display_name,email,groups,active,synced_at,raw)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(external_id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name,
      email=excluded.email, groups=excluded.groups, active=excluded.active, synced_at=excluded.synced_at, raw=excluded.raw`);
  let imported = 0, skipped = 0;
  for (const row of rows) {
    const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), typeof v === 'string' ? v.trim() : v]));
    const externalId = pick(lower, ['account_id', 'accountid', 'external_id', 'externalid', 'id', 'user_id', 'userid', 'user id']);
    if (!externalId) { skipped++; continue; }
    const displayName = pick(lower, ['display_name', 'displayname', 'name', 'full_name', 'fullname', 'user name']);
    const email = pick(lower, ['email', 'email_address', 'emailaddress']);
    const username = pick(lower, ['username', 'user_name', 'login']) || email;
    const groupsRaw = pick(lower, ['groups', 'group', 'teams', 'group membership']);
    const groups = groupsRaw ? groupsRaw.split(/[;,]/).map(g => g.trim()).filter(Boolean).join(',') : '';
    const statusValue = pick(lower, ['status', 'account_status', 'accountstatus', 'active', 'user status']).toLowerCase();
    const active = ['', 'active', 'enabled', 'true', '1', 't'].includes(statusValue) ? 1 : 0;
    upsert.run(externalId, username, displayName, email, groups, active, now, JSON.stringify(row));
    seen.add(externalId);
    imported++;
  }
  const deactivated = replace ? db.prepare("UPDATE identities SET active=0, synced_at=? WHERE synced_at!=? RETURNING external_id").all(now, now).length : 0;
  return { imported, skipped, deactivated, total: db.prepare('SELECT count(*) AS n FROM identities').get().n };
}

export function listIdentities(db) {
  return db.prepare('SELECT external_id,username,display_name,email,groups,active FROM identities ORDER BY active DESC, display_name COLLATE NOCASE, username COLLATE NOCASE').all()
    .map(r => ({ ...r, groups: r.groups ? r.groups.split(',') : [], active: !!r.active }));
}

export function findIdentity(db, externalId) {
  const row = db.prepare('SELECT external_id,username,display_name,email,groups,active FROM identities WHERE external_id=?').get(externalId || '');
  return row ? { ...row, groups: row.groups ? row.groups.split(',') : [], active: !!row.active } : null;
}

// --- Local session cookie: signed, not encrypted (only display data, no secrets inside). ---

function sessionSecret(cacheDir) {
  const file = path.join(cacheDir, 'session-secret');
  if (existsSync(file)) return readFileSync(file);
  const secret = randomBytes(32);
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

// --- Local admin account: gates the /settings backend (SAML config, user directory, orphaned users). ---
// Separate from the identities table above, which holds *test* identities for permission checks, not real logins.

function hashPassword(password, salt = randomBytes(16)) {
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function ensureAdminAccount(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 1
  );`);
  if (!db.prepare('SELECT id FROM admin_account WHERE id=1').get()) {
    db.prepare('INSERT INTO admin_account(id,username,password_hash,must_change_password) VALUES(1,?,?,1)').run('admin', hashPassword('admin'));
  }
}

export function verifyAdminLogin(db, username, password) {
  const row = db.prepare('SELECT * FROM admin_account WHERE id=1').get();
  if (!row || row.username !== username || !verifyPassword(password || '', row.password_hash)) return null;
  return { username: row.username, mustChangePassword: !!row.must_change_password };
}

export function changeAdminPassword(db, currentPassword, newPassword) {
  const row = db.prepare('SELECT * FROM admin_account WHERE id=1').get();
  if (!row || !verifyPassword(currentPassword || '', row.password_hash)) throw Object.assign(new Error('Aktuelles Passwort ist falsch'), { status: 403 });
  if (!newPassword || newPassword.length < 8) throw Object.assign(new Error('Neues Passwort muss mindestens 8 Zeichen haben'), { status: 400 });
  db.prepare('UPDATE admin_account SET password_hash=?, must_change_password=0 WHERE id=1').run(hashPassword(newPassword));
}

export function createSessionCodec(cacheDir) {
  const secret = sessionSecret(cacheDir);
  const sign = data => createHmac('sha256', secret).update(data).digest('base64url');
  return {
    encode(payload) {
      const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${data}.${sign(data)}`;
    },
    decode(cookie) {
      if (!cookie) return null;
      const [data, signature] = cookie.split('.');
      if (!data || !signature) return null;
      const expected = sign(data);
      if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
      try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
      } catch { return null; }
    },
  };
}
