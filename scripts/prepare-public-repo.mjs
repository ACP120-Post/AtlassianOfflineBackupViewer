import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicRepo = path.join(root, 'public-viewer');
const destination = process.argv[2] && path.resolve(process.argv[2]);
if (!destination || destination === root || (destination.startsWith(`${root}${path.sep}`) && destination !== publicRepo)) {
  throw new Error('Usage: npm run prepare:public-repo -- ./public-viewer (or an external empty path)');
}
const updating = existsSync(destination);
if (updating && !existsSync(path.join(destination, '.git'))) throw new Error(`Not a Git repository: ${destination}`);
if (updating) {
  const publicStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: destination, encoding: 'utf8' });
  if (publicStatus) throw new Error('Commit or discard changes in the public repository before refreshing it.');
}
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
if (status) throw new Error('Prepare a public snapshot from a clean, committed revision only.');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const license = readFileSync(path.join(root, 'LICENSE'), 'utf8');
if (pkg.license !== 'AGPL-3.0-only' || !license.includes('GNU AFFERO GENERAL PUBLIC LICENSE') || !license.includes('Version 3')) {
  throw new Error('The viewer must declare AGPL-3.0-only and include its full license text.');
}
const temp = mkdtempSync(path.join(os.tmpdir(), 'viewer-public-'));
const archive = path.join(temp, 'source.tar');
let created = false;
try {
  execFileSync('git', ['archive', '--format=tar', '--worktree-attributes', `--output=${archive}`, 'HEAD'], { cwd: root, stdio: 'inherit' });
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).split('\n');
  const forbidden = entries.filter(name => !name.endsWith('/') && (/^(forge-licence\/|\.claude\/|\.serena\/|settings\.json$|backup-sites\.json$|export-users\.csv$|.*\.zip$|dist\/|\.cache\/|backups\/|test-results\/|playwright-report\/)/.test(name) || /(^|\/)(\.env[^/]*|[^/]*\.(pem|key|p12|pfx|local\.json))$/.test(name)));
  if (forbidden.length) throw new Error(`Internal files leaked into snapshot: ${forbidden.join(', ')}`);
  for (const required of ['LICENSE', 'COPYRIGHT.md', 'THIRD_PARTY_NOTICES.md', 'server/saml.mjs', 'server/licence.mjs', 'server/identity.mjs', 'server/permissions.mjs', 'src/main.jsx', 'src/jira.jsx', 'package.json']) {
    if (!entries.includes(required)) throw new Error(`Required viewer source missing from snapshot: ${required}`);
  }
  if (!pkg.dependencies?.['@node-saml/node-saml']) throw new Error('The default build no longer includes the SAML dependency.');

  if (updating) {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: destination, encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const name of tracked) {
      const file = path.resolve(destination, name);
      if (!file.startsWith(`${destination}${path.sep}`)) throw new Error(`Invalid tracked path in public repository: ${name}`);
      rmSync(file, { force: true });
    }
  } else {
    mkdirSync(destination);
    created = true;
  }
  execFileSync('tar', ['-xf', archive, '-C', destination], { stdio: 'inherit' });
  const publicIgnores = [
    '',
    '# Private and generated files are excluded from the public working copy.',
    'forge-licence/', 'public-viewer/', '.claude/', '.serena/', '.idea/',
    'settings.json', 'backup-sites.json', 'export-users.csv', '*.zip', 'backups/', '.cache/',
    '.env*', '*.pem', '*.key', '*.p12', '*.pfx', '*.local.json',
    'documentation.html', 'server/licence.mjs.save', '',
  ].join('\n');
  const publicGitignore = path.join(destination, '.gitignore');
  writeFileSync(publicGitignore, `${readFileSync(publicGitignore, 'utf8').trimEnd()}\n${publicIgnores}`);
  if (!updating) {
    execFileSync('git', ['init', '--initial-branch=main'], { cwd: destination, stdio: 'inherit' });
    const name = execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim();
    const email = execFileSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).trim();
    execFileSync('git', ['config', 'user.name', name], { cwd: destination });
    execFileSync('git', ['config', 'user.email', email], { cwd: destination });
  }
  execFileSync('git', ['add', '-A'], { cwd: destination });
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: destination, stdio: 'ignore' });
    console.log(`Public repository is already up to date at ${destination}.`);
  } catch (error) {
    if (error.status !== 1) throw error;
    const sourceCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const message = updating ? `Refresh public viewer from ${sourceCommit}` : 'Initial public viewer snapshot';
    execFileSync('git', ['commit', '-m', message], { cwd: destination, stdio: 'inherit' });
    console.log(`${updating ? 'Updated' : 'Created'} public Git repository at ${destination}; add its GitHub remote after review.`);
  }
} catch (error) {
  if (created) rmSync(destination, { recursive: true, force: true });
  throw error;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
