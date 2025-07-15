import { request } from '@playwright/test';

// Logs in as the default local admin, clears the forced first-login password change, imports and
// switches to a test identity with universal VIEWSPACE access in the real sample backup (content
// permission checks are always mandatory, mirroring Confluence DC with anonymous access disabled),
// and stores the resulting session cookies so every test starts already authenticated.
export default async function globalSetup() {
  const context = await request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  await context.post('/api/auth/admin-login', { data: { username: 'admin', password: 'admin' } });
  await context.post('/api/auth/admin-change-password', { data: { currentPassword: 'admin', newPassword: 'browser-test-password-123' } });
  await context.post('/api/auth/import-users', { headers: { 'Content-Type': 'text/csv' },
    data: 'User id,User name,email\n6035864ce2020c0070b5285b,Test User,test-user@example.com\ncentral-agent,Agentin,agent@example.test\ncentral-customer,Kundin,customer@example.test\ncentral-real-agent,Archivtest,archive@example.test\n' });
  await context.post('/api/auth/switch', { data: { externalId: '6035864ce2020c0070b5285b' } });
  await context.storageState({ path: 'test-results/admin-storage-state.json' });
  await context.dispose();
}
