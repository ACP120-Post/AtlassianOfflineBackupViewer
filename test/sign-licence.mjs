import { createPrivateKey, sign } from 'node:crypto';

export function signLicence({ company, exp, trial = false }, privateKeyDerB64) {
  const data = Buffer.from(JSON.stringify({ v: 1, company, exp, trial })).toString('base64url');
  const key = createPrivateKey({ key: Buffer.from(privateKeyDerB64, 'base64'), format: 'der', type: 'pkcs8' });
  return `${data}.${sign(null, Buffer.from(data), key).toString('base64url')}`;
}
