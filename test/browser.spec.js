import { test,expect } from '@playwright/test';
import { PAGE_ID } from './fixture.mjs';
let alpha,beta,real;
test.beforeAll(async({request})=>{
  const backups=await(await request.get('/api/backups')).json();
  alpha=backups.find(b=>b.name==='alpha.zip');beta=backups.find(b=>b.name==='beta.zip');real=backups.find(b=>b.name.startsWith('confluence_backup'));
});
test('AGPL notice is visible and the full license is served offline',async({page,request})=>{
  const response=await request.get('/LICENSE');expect(response.ok()).toBeTruthy();expect(await response.text()).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
  await page.goto('/');await expect(page.locator('.license-notice')).toContainText('AGPL-3.0-only');await expect(page.locator('.license-notice a')).toHaveAttribute('href','/LICENSE');
});
test('Seitenbaum, Layout, Makros, Kommentare, Versionen und Rohdaten',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/b/${alpha.id}/content/${PAGE_ID}`);
  await expect(page.getByRole('heading',{name:'Testwissen Alpha',exact:true})).toBeVisible();
  await expect(page.locator('.layout-two_equal')).toBeVisible();
  await expect(page.locator('pre code')).toContainText('if (a < 2)');
  await expect(page.getByText('Ein gespeicherter Kommentar',{exact:true})).toBeVisible();
  await expect(page.locator('input[type=checkbox]')).toBeChecked();
  await expect(page.locator('input[type=checkbox]')).toBeDisabled();
  await page.getByText('Mehr Wissen',{exact:true}).click();
  await expect(page.getByText('Gespeicherter Text',{exact:true})).toBeVisible();
  await expect(page.getByText('Gespeicherte Jira-Daten',{exact:true})).toBeVisible();
  await page.locator('.macro-fallback summary').click();
  await expect(page.getByText('TEST-1',{exact:true})).toBeVisible();
  const collapse=page.getByRole('button',{name:'Testwissen Alpha: Unterseiten zuklappen'});await collapse.click();
  await expect(page.getByRole('navigation',{name:'Seitenbaum'}).getByRole('link',{name:'Unterseite',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Testwissen Alpha: Unterseiten aufklappen'}).click();
  await expect(page.getByRole('navigation',{name:'Seitenbaum'}).getByRole('link',{name:'Unterseite',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Versionen',exact:true}).click();
  await page.getByRole('link',{name:'Version 2',exact:true}).click();
  await expect(page.getByText('Historische Version 2',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Zur Hauptversion wechseln'}).click();
  await page.getByRole('button',{name:'Rohdaten',exact:true}).click();
  await expect(page.locator('.raw-data')).toContainText(PAGE_ID);
  await page.getByRole('button',{name:'Inhalt',exact:true}).click();
  await page.getByRole('link',{name:'Zur Unterseite',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Unterseite',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
test('Suche und Statusfilter zählen historische Versionen nicht doppelt',async({page,request})=>{
  await page.goto(`/b/${alpha.id}/spaces`);
  await page.getByRole('textbox',{name:'Backup durchsuchen'}).fill('Einzigartiger');
  await page.getByRole('textbox',{name:'Backup durchsuchen'}).press('Enter');
  await expect(page.getByRole('heading',{name:'1 Treffer'})).toBeVisible();
  await expect(page.locator('mark')).toHaveText('Einzigartiger');
  const historic=await(await request.get(`/api/backups/${alpha.id}/search?q=Geheimnotiz`)).json();expect(historic.total).toBe(0);
  await page.getByRole('textbox',{name:'Suchbegriff',exact:true}).fill('Entwurf');
  await page.getByLabel('Suchstatus').selectOption('draft');await page.getByRole('button',{name:'Suchen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'1 Treffer'})).toBeVisible();
  await page.locator('.result-title').click();await expect(page.getByRole('heading',{name:'Entwurf',exact:true})).toBeVisible();
  await page.getByLabel('Inhaltsstatus',{exact:true}).selectOption('deleted');
  await expect(page.getByRole('navigation',{name:'Seitenbaum'})).toContainText('Gelöschte Seite');
});
test('Backup-Wechsel isoliert identische Confluence-IDs; fehlerhafte ZIPs bleiben auswählbar',async({page,request})=>{
  await page.goto(`/b/${alpha.id}/content/${PAGE_ID}`);await expect(page.getByRole('heading',{name:'Testwissen Alpha',exact:true})).toBeVisible();
  await page.getByLabel('Backup auswählen',{exact:true}).selectOption(beta.id);await expect(page.getByRole('heading',{name:'Bereiche',exact:true})).toBeVisible();
  await page.getByLabel('Bereich auswählen',{exact:true}).selectOption('s1');await page.getByRole('link',{name:'Bereichsstartseite öffnen',exact:false}).click();
  await expect(page.getByRole('heading',{name:'Testwissen Beta',exact:true})).toBeVisible();await expect(page.locator('main')).not.toContainText('Testwissen Alpha');
  const backups=await(await request.get('/api/backups')).json();const bad=backups.find(b=>b.name==='kaputt.zip');await page.getByLabel('Backup auswählen',{exact:true}).selectOption(bad.id);
  await expect(page.getByText('Dieses Backup konnte nicht importiert werden',{exact:true})).toBeVisible();
  await page.getByLabel('Backup auswählen',{exact:true}).selectOption(alpha.id);await expect(page.getByRole('heading',{name:'Bereiche',exact:true})).toBeVisible();
});
test('Anhangdownload, Bildvorschau, Datenbank und Whiteboard-Grenzen',async({page,request})=>{
  await page.goto(`/b/${alpha.id}/content/${PAGE_ID}`);await expect(page.getByRole('heading',{name:'Testwissen Alpha',exact:true})).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'aktiv.html herunterladen'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('aktiv.html');
  const response=await request.get(`/api/backups/${alpha.id}/attachments/attachment`);expect(response.headers()['content-type']).toBe('application/octet-stream');expect(response.headers()['content-disposition']).toMatch(/^attachment;/);expect(await response.text()).toContain('<script>');
  await page.getByRole('button',{name:'Vorschau',exact:true}).click();await expect(page.locator('.attachment-preview img')).toBeVisible();await expect.poll(()=>page.locator('.attachment-preview img').evaluate(img=>img.naturalWidth)).toBe(1);
  await page.goto(`/b/${alpha.id}/content/database`);await expect(page.getByRole('cell',{name:'Gespeicherter Eintrag'})).toBeVisible();
  await page.goto(`/b/${alpha.id}/content/whiteboard`);await expect(page.getByText('Whiteboard nicht rekonstruierbar',{exact:true})).toBeVisible();
});
test('HTTP-Endpunkte sind nur lesend und gegen fremde Ursprünge und Pfade abgesichert',async({request})=>{
  expect((await request.post(`/api/backups/${alpha.id}/content/${PAGE_ID}`,{data:{title:'Änderung'}})).status()).toBe(405);
  expect((await request.get('/api/backups',{headers:{Origin:'https://evil.test'}})).status()).toBe(403);
  expect((await request.get('/api/backups',{headers:{Host:'evil.test:3001'}})).status()).toBe(403);
  expect((await request.get(`/api/backups/${alpha.id}/attachments/..%2F..%2Fpackage.json`)).status()).toBe(404);
  expect((await request.get(`/api/backups/unknown/content/${PAGE_ID}`)).status()).toBe(404);
});
test('Echtes Backup: Sollzahlen, Suche, Layouts, Berichte und Offline-Nutzung',async({page,request})=>{
  test.skip(!real,'Das echte ZIP ist nicht installiert');
  const external=[];await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.href);return route.abort();}return route.continue();});
  await page.goto(`/b/${real.id}/spaces`);await expect(page.locator('.space-card')).toHaveCount(19);
  await page.screenshot({path:'test-results/overview.png',fullPage:false});
  const report=await(await request.get(`/api/backups/${real.id}/report`)).json();expect(report.counts).toMatchObject({spaces:19,content:4108,bodies:3736,files:302,emptyDatabases:14,whiteboardsWithoutExport:2});
  await page.getByRole('textbox',{name:'Bereiche filtern'}).fill('One Atlassian');await expect(page.locator('.space-card')).toHaveCount(1);await page.locator('.space-card').click();
  await page.getByRole('link',{name:'Bereichsstartseite öffnen',exact:false}).click();await expect(page.locator('.storage-content')).toBeVisible();
  await page.goto(`/b/${real.id}/content/720904`);await expect(page.getByRole('heading',{name:'Jira Service Management',exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Versionen',exact:true}).click();await expect(page.getByRole('link',{name:'Version 13 (Hauptversion)'})).toBeVisible();
  await page.goto(`/b/${real.id}/content/2785315`);await expect(page.locator('.local-macro')).toContainText('Seitenbericht');
  await page.goto(`/b/${real.id}/content/1572867`);await expect(page.getByText('Leerer Datenbankexport',{exact:true})).toBeVisible();
  await page.goto(`/b/${real.id}/content/1736953`);await expect(page.getByText('Whiteboard nicht rekonstruierbar',{exact:true})).toBeVisible();
  await page.goto(`/b/${real.id}/content/1736784`);
  const original=page.locator('.original-source a');await expect(original).toHaveAttribute('href','https://sva-aldi-demo.atlassian.net/wiki/spaces/S/pages/1736784/Project+Update+-+Compliance+Assessment+Report');
  await expect(original).toHaveAttribute('target','_blank');
  await page.screenshot({path:'test-results/page.png',fullPage:false});
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await expect(original).toBeInViewport();
  await page.getByRole('textbox',{name:'Backup durchsuchen'}).fill('Jira');await page.getByRole('textbox',{name:'Backup durchsuchen'}).press('Enter');await expect(page.locator('.search-result').first()).toBeVisible();
  expect(external).toEqual([]);
});
test('Mobile Navigation und Tastaturbedienung',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto(`/b/${alpha.id}/spaces`);await expect(page.getByRole('heading',{name:'Bereiche',exact:true})).toBeVisible();
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Zum Inhalt springen'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button',{name:'Navigation öffnen'}).click();await expect(page.getByLabel('Backup auswählen',{exact:true})).toBeVisible();
  await page.getByLabel('Bereich auswählen',{exact:true}).selectOption('s1');await expect(page.getByRole('heading',{name:'Testbereich',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('Atlassian-Typografie, Auswahlzustände und responsive Oberfläche',async({page})=>{
  for (const width of [320,768,1280]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(`/b/${alpha.id}/spaces`);
    await expect(page.getByRole('heading',{name:'Bereiche',exact:true})).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.fonts.check('14px "Atlassian Sans"'))).toBe(true);
    await expect(page.locator('body')).toHaveCSS('color','rgb(41, 42, 46)');
    await expect(page.locator('h1')).toHaveCSS('font-size','28px');
    await expect(page.getByRole('link',{name:'Einstellungen',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/design-spaces-${width}.png`});
    if (width<800) {
      await page.getByRole('button',{name:'Navigation öffnen'}).click();
      await expect(page.locator('.primary-nav .selected')).toHaveCSS('background-color','rgb(233, 242, 254)');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button',{name:'Navigation öffnen'})).toBeFocused();
      await expect(page.locator('.sidebar')).toBeHidden();
    }
    await page.goto(`/b/${alpha.id}/content/${PAGE_ID}`);
    await expect(page.locator('.storage-content').first()).toBeVisible();
    await expect(page.locator('.storage-content').first()).toHaveCSS('font-size','16px');
    await expect(page.getByText('Veröffentlicht',{exact:true}).last()).toHaveCSS('text-transform','none');
    await page.getByRole('button',{name:'Versionen',exact:true}).click();
    await expect(page.getByRole('button',{name:'Versionen',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.data-table')).toHaveCSS('font-size','14px');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/design-page-${width}.png`});
    await page.goto('/settings');
    await expect(page.getByRole('heading',{name:'Einstellungen',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/design-settings-${width}.png`});
  }
  await page.context().clearCookies();
  await page.setViewportSize({width:320,height:800});
  await page.goto('/login');
  await expect(page.getByRole('heading',{name:'Bei Confluence anmelden'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Anmelden',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/design-login-320.png'});
});
