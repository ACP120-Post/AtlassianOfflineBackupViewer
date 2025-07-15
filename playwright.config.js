import { defineConfig } from '@playwright/test';
import { generateKeyPairSync } from 'node:crypto';
import { signLicence } from './test/sign-licence.mjs';

// Die Browser-Tests decken die lizenzpflichtigen Funktionen ab (Identitätswechsel, Import,
// Berechtigungsfilterung) – dafür wird pro Lauf ein eigenes Schlüsselpaar ausgestellt.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const licence = {
  LICENCE_PUBLIC_KEY: publicKey.export({type:'spki',format:'der'}).toString('base64'),
  LICENCE_KEY: signLicence({ company: 'Browser Test GmbH', exp: Date.now() + 86400000 },
    privateKey.export({type:'pkcs8',format:'der'}).toString('base64')),
};
export default defineConfig({
  testDir:'./test', testMatch:['browser.spec.js','jira.browser.spec.js'], workers:1, globalSetup:'./test/global-setup.mjs',
  use:{ baseURL:'http://127.0.0.1:3001', channel:'chrome', locale:'de-DE', viewport:{width:1440,height:1000}, screenshot:'only-on-failure', storageState:'test-results/admin-storage-state.json' },
  webServer:{ command:'node test/prepare-browser.mjs && npm start -- --backup-dir .cache/browser-backups --cache-dir .cache/browser-cache --port 3001', url:'http://127.0.0.1:3001/', reuseExistingServer:false, timeout:120000, env:{...process.env,...licence} },
});
