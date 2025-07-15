import { copyFile, constants, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { writeFixtures } from './fixture.mjs';
import { zipBytes } from './fixture.mjs';
import { jiraFixture } from './jira-fixture.mjs';
// Fresh admin account (default admin/admin) on every run, so global-setup's login is idempotent.
await rm('.cache/browser-cache/identity.sqlite', { force: true });
await rm('.cache/browser-cache/session-secret', { force: true });
await writeFixtures('.cache/browser-backups');
const real='confluence_backup_csv_2026-09-10.zip';
if(existsSync(real))await copyFile(real,`.cache/browser-backups/${real}`,constants.COPYFILE_FICLONE);
await writeFile('.cache/browser-backups/jira-fixture.zip',zipBytes(jiraFixture()));
if(existsSync('jira-export (3).zip'))await copyFile('jira-export (3).zip','.cache/browser-backups/jira-export (3).zip',constants.COPYFILE_FICLONE);
