import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { verifyLicence } from '../server/licence.mjs';
import { canRead } from '../server/permissions.mjs';
import { signLicence } from './sign-licence.mjs';

const keypair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    priv: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
};
const { pub, priv } = keypair();
const day = 24 * 60 * 60 * 1000;

test('valid signed licence is accepted', () => {
  const key = signLicence({ company: 'Acme Ltd', exp: Date.now() + 30 * day, trial: true }, priv);
  const licence = verifyLicence(key, pub);
  assert.equal(licence.company, 'Acme Ltd');
  assert.equal(licence.trial, true);
  assert.equal(licence.valid, true);
});

test('expired signed licence is readable but invalid', () => {
  const exp = Date.now() - day;
  const licence = verifyLicence(signLicence({ company: 'Acme Ltd', exp }, priv), pub);
  assert.equal(licence.valid, false);
  assert.equal(licence.exp, exp);
});

test('forged, altered, and malformed licences are rejected', () => {
  const key = signLicence({ company: 'Acme Ltd', exp: Date.now() + day }, priv);
  const [data, signature] = key.split('.');
  const tampered = Buffer.from(JSON.stringify({ v: 1, company: 'Other Ltd', exp: Date.now() + 999 * day })).toString('base64url');
  assert.equal(verifyLicence(`${tampered}.${signature}`, pub), null);
  assert.equal(verifyLicence(key, keypair().pub), null);
  const bytes = Buffer.from(signature, 'base64url');
  bytes[0] ^= 1;
  assert.equal(verifyLicence(`${data}.${bytes.toString('base64url')}`, pub), null);
  for (const junk of ['', null, undefined, 'no-dot', 'a.b', '.'.repeat(10)]) assert.equal(verifyLicence(junk, pub), null);
});

test('unlicensed local admin bypasses permission-table lookups', () => {
  const db = { prepare() { throw new Error('permission tables were queried'); } };
  const row = { id: 'page', root_id: 'page' };
  assert.deepEqual(canRead(db, row, 'SPACE', { superuser: true }), { allow: true, reason: 'unlicensed-single-admin' });
  assert.throws(() => canRead(db, row, 'SPACE', { externalId: 'user', groups: [] }), /permission tables were queried/);
});
