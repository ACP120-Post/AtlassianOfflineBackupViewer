// Imports a Guard/Atlassian user export CSV into .cache/identity.sqlite.
// Run manually: `npm run import:identity -- pfad/zum/export.csv`
// This never runs from the browser: importing users is an explicit, local, read-only-to-the-ZIP operation.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { openIdentityDb, importIdentityRows } from '../server/identity.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const file = process.argv[2];
if (!file) { console.error('Verwendung: npm run import:identity -- <export.csv>'); process.exit(1); }

const csv = await readFile(path.resolve(file), 'utf8');
const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true });
const db = openIdentityDb(path.join(rootDir, '.cache'));
try {
  const result = importIdentityRows(db, rows);
  console.log(`Importiert: ${result.imported}, übersprungen (keine ID): ${result.skipped}, deaktiviert: ${result.deactivated}, gesamt: ${result.total}`);
} finally {
  db.close();
}
