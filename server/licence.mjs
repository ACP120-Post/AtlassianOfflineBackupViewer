import { createPublicKey, verify } from 'node:crypto';

// Offline-Lizenzprüfung: Lizenzschlüssel werden mit Ed25519 ausgestellt und hier nur gegen den öffentlichen Schlüssel geprüft.
// Format wie die Session-Cookies in identity.mjs: base64url(JSON).base64url(signatur)
// LICENCE_PUBLIC_KEY/LICENCE_KEY existieren nur für die Testsuite, die ihr eigenes Schlüsselpaar
// erzeugt – sie gehören nicht in die Kundendokumentation.
const PUBLIC_KEY_DER_B64 = process.env.LICENCE_PUBLIC_KEY || 'MCowBQYDK2VwAyEAo1Q1Djqzg4zxXf3WBEP1UFtO/oIgzRI18sIG2Y45Pbw=';

const publicKey = b64 => createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });

// null = kein/ungültiger/gefälschter Schlüssel. valid:false = echt, aber abgelaufen (für die Anzeige).
export function verifyLicence(key, pubB64 = PUBLIC_KEY_DER_B64) {
  const [data, signature] = String(key || '').trim().split('.');
  if (!data || !signature) return null;
  try {
    if (!verify(null, Buffer.from(data), publicKey(pubB64), Buffer.from(signature, 'base64url'))) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.v !== 1 || !payload.company || !Number.isFinite(payload.exp)) return null;
    return { company: payload.company, exp: payload.exp, trial: !!payload.trial, valid: Date.now() <= payload.exp };
  } catch { return null; }
}
