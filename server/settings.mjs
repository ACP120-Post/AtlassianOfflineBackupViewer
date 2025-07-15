import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';

// settings.json is the runtime-editable source of truth. saml-config.json (if present) is only
// ever used once, to seed settings.json on the very first start — it is never read again after that.
export function loadSettings(rootDir) {
  const file = path.join(rootDir, 'settings.json');
  if (existsSync(file)) {
    const settings = JSON.parse(readFileSync(file, 'utf8'));
    return { saml: settings.saml || null, licence: settings.licence || null };
  }
  const samlFile = path.join(rootDir, 'saml-config.json');
  let saml = null;
  if (existsSync(samlFile)) {
    const config = JSON.parse(readFileSync(samlFile, 'utf8'));
    if (config.idpSsoUrl && config.idpCert && config.issuer && config.callbackUrl) saml = config;
  }
  const settings = { saml, licence: null };
  saveSettings(rootDir, settings);
  return settings;
}

export function saveSettings(rootDir, settings) {
  if (settings.saml) {
    const required = ['idpSsoUrl', 'idpCert', 'issuer', 'callbackUrl'];
    if (required.some(key => !settings.saml[key])) throw Object.assign(new Error('SAML-Konfiguration ist unvollständig'), { status: 400 });
  }
  const clean = { saml: settings.saml || null, licence: settings.licence || null };
  const file = path.join(rootDir, 'settings.json');
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(clean, null, 2));
  renameSync(tmp, file);
  return clean;
}
