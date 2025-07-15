import {test,expect} from '@playwright/test';
let jira,confluence,real;
test.beforeAll(async({request})=>{const bs=await(await request.get('/api/backups')).json();jira=bs.find(b=>b.name==='jira-fixture.zip');confluence=bs.find(b=>b.name==='alpha.zip');real=bs.find(b=>b.name==='jira-export (3).zip');});
test.beforeEach(async({page})=>{await page.request.post('/api/auth/switch',{data:{externalId:'central-agent'}});});
test('Produkteinstieg, Direktlinks, Suche, Boards, Agentenansicht und Konfiguration',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Deine archivierten Arbeitsbereiche'})).toBeVisible();await page.getByRole('link',{name:'jira-fixture.zip',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Projekte',exact:true})).toBeVisible();await page.getByRole('link',{name:'Service-Team',exact:true}).click();await expect(page.getByRole('heading',{name:'Service-Team',exact:true})).toBeVisible();
  await page.goto(`/jira/b/${jira.id}/issues/HELP-1`);await expect(page.getByRole('heading',{name:'Laptop startet nicht'})).toBeVisible();await expect(page.getByText('INTERNE-NOTIZ',{exact:true})).toBeVisible();await expect(page.getByText('GRUPPENGEHEIM')).toHaveCount(0);await expect(page.getByText('Datei fehlt im Archiv')).toBeVisible();await expect(page.getByRole('button',{name:'Bearbeiten',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Verlauf',exact:true}).click();await expect(page.locator('main')).toContainText('Neu → Offen');await page.getByRole('button',{name:'Arbeitszeiten'}).click();await expect(page.locator('main')).toContainText('Diagnose');
  await page.goto(`/jira/b/${jira.id}/search?project=p`);await expect(page.getByRole('status')).toContainText('60 Treffer');await page.getByRole('button',{name:'Weiter',exact:true}).click();await expect(page.getByRole('status')).toContainText('51–60');
  await page.getByLabel('JQL-Filter',{exact:true}).fill('issue in unknownFunction()');await page.getByRole('button',{name:'Suchen',exact:true}).click();await expect(page.getByRole('alert')).toContainText('JQL nicht auswertbar');await expect(page.locator('.jira-table tbody tr')).toHaveCount(0);
  await page.goto(`/jira/b/${jira.id}/boards/board`);await expect(page.getByRole('heading',{name:'Support-Board',exact:true})).toBeVisible();await expect(page.locator('.jira-issue-card')).toHaveCount(50);await page.getByLabel('Sprint',{exact:true}).selectOption('sprint');await expect(page.locator('.jira-issue-card')).toHaveCount(1);
  await page.goto(`/jira/b/${jira.id}/queues/queue`);await expect(page.getByRole('heading',{name:'Offene Anfragen'})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Schlüssel'})).toBeVisible();await page.goto(`/jira/b/${jira.id}/queues/bad-queue`);await expect(page.getByText('Warteschlange nicht auswertbar',{exact:true})).toBeVisible();
  for(const [path,heading] of [['customers','Kunden und Organisationen'],['dashboards/dash','Team-Dashboard'],['reports','Berichte']]){await page.goto(`/jira/b/${jira.id}/${path}`);await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();}
  expect(errors).toEqual([]);
});
test('Projektzentrische Navigation: Zusammenfassung, Zeitleiste, Backlog, Board und Einstellungen',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/jira/b/${jira.id}/projects`);await page.getByRole('link',{name:'Entwicklung',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/projects/DEV/summary$`));await expect(page.getByRole('heading',{name:'Entwicklung',exact:true})).toBeVisible();
  const nav=page.getByRole('navigation',{name:'Projekt-Navigation'});for(const label of ['Zusammenfassung','Zeitleiste','Backlog','Board','Vorgänge','Releases','Komponenten'])await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
  await nav.getByRole('link',{name:'Zeitleiste',exact:true}).click();await expect(page.getByRole('heading',{name:'Zeitleiste',exact:true})).toBeVisible();await expect(page.locator('.roadmap-bar').first()).toBeVisible();await expect(page.getByRole('heading',{name:/Ohne Zeitraum im Export/})).toBeVisible();
  await nav.getByRole('link',{name:'Backlog',exact:true}).click();await expect(page.getByRole('heading',{name:'Backlog',exact:true}).first()).toBeVisible();await expect(page.locator('.jira-backlog-section')).not.toHaveCount(0);
  await nav.getByRole('link',{name:'Board',exact:true}).click();await expect(page.locator('.jira-issue-card').first()).toBeVisible();await page.getByLabel('Gruppierung',{exact:true}).selectOption('assignee');await expect(page.locator('.jira-swimlane-title').first()).toBeVisible();
  // Konfiguration bleibt den Projekteinstellungen vorbehalten
  for(const view of ['summary','timeline','backlog','board','issues','releases','components'])
    {await page.goto(`/jira/b/${jira.id}/projects/DEV/${view}`);await expect(page.locator('#main')).not.toContainText(/Berechtigungen|Swimlanes|Gespeicherter Filter|Workflow/);}
  await page.getByRole('link',{name:'Projekteinstellungen',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Projekteinstellungen',exact:true})).toBeVisible();
  for(const heading of ['Vorgangstypen und Workflows','Rollen','Berechtigungen','Vorgangssicherheit'])await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
  await expect(page.locator('#main')).toContainText('Swimlanes');
  // Custom Fields typgerecht statt <pre>
  await page.goto(`/jira/b/${jira.id}/issues/HELP-1`);await page.getByText('Weitere Felder').click();
  await expect(page.locator('.jira-detail-panel .jira-chip',{hasText:'Hardware'})).toBeVisible();await expect(page.locator('.jira-detail-panel pre')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Projekt-Navigation'})).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('Kundenportal trennt öffentliche Felder, Kommentare, Anfragen und Downloads von Agentendaten',async({page})=>{
  await page.request.post('/api/auth/switch',{data:{externalId:'central-customer'}});await page.request.post('/api/auth/admin-logout');
  await page.goto(`/jira/b/${jira.id}/portal/requests`);await expect(page.getByRole('heading',{name:'Eigene und geteilte Anfragen'})).toBeVisible();await expect(page.getByRole('status')).toContainText('3 Treffer');
  await page.getByRole('link',{name:'Laptop startet nicht'}).click();await expect(page.getByText('Öffentliche Antwort',{exact:true})).toBeVisible();await expect(page.getByText('Kundenwert',{exact:true})).toBeVisible();for(const secret of ['INTERNE-NOTIZ','AGENTENFELD-GEHEIM','GRUPPENGEHEIM'])await expect(page.getByText(secret)).toHaveCount(0);
  const api=`/api/backups/${jira.id}/jira`;for(const path of ['issues/HELP-1','portal/requests/HELP-2','portal/attachments/private-file'])expect((await page.request.get(`${api}/${path}`)).status()).toBe(404);
  expect((await page.request.get('/api/auth/jira-identities')).status()).toBe(403);expect((await page.request.get(`${api}/report`)).status()).toBe(403);
  await page.goto(`/jira/b/${jira.id}/portal/portals/portal`);await expect(page.getByRole('heading',{name:'IT-Hilfe'})).toBeVisible();await page.getByRole('link',{name:'IT-Unterstützung',exact:true}).first().click();await expect(page.getByRole('heading',{name:'IT-Unterstützung'})).toBeVisible();await expect(page.getByRole('button',{name:'Anfrage senden'})).toBeDisabled();await expect(page.getByText('Agentenfeld',{exact:true})).toHaveCount(0);
});
test('Drei Produktkombinationen und Benutzerrechte greifen serverseitig auch für Direktlinks',async({page})=>{
  try {
    for(const products of [{confluence:true,jira:true},{confluence:true,jira:false},{confluence:false,jira:true}]){
      expect((await page.request.post('/api/auth/products',{data:products})).ok()).toBe(true);
      expect((await page.request.get(`/api/backups/${confluence.id}/spaces`)).status()).toBe(products.confluence?200:403);
      for(const route of ['projects','search','issues/HELP-1','boards/board','queues/queue','attachments/file','portal/requests','configuration','report']){const response=await page.request.get(`/api/backups/${jira.id}/jira/${route}`);if(!products.jira)expect(response.status()).toBe(403);else expect([200,404]).toContain(response.status());}
      await page.goto('/');await expect(page.getByRole('heading',{name:'Jira',exact:true})).toHaveCount(products.jira?1:0);await expect(page.getByRole('heading',{name:'Confluence',exact:true})).toHaveCount(products.confluence?1:0);
    }
    await page.request.post('/api/auth/product-users',{data:{externalId:'central-agent',product:'jira',enabled:false}});expect((await page.request.get(`/api/backups/${jira.id}/jira/projects`)).status()).toBe(403);
  }finally{await page.request.post('/api/auth/products',{data:{confluence:true,jira:true}});await page.request.post('/api/auth/product-users',{data:{externalId:'central-agent',product:'jira',enabled:true}});}
});
test('Jira und Portal: Tastatur, lokale Schriften und Layout bei 320, 768 und 1440 Pixeln',async({page})=>{
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:1000});await page.goto(`/jira/b/${jira.id}/issues/HELP-1`);await expect(page.getByRole('heading',{name:'Laptop startet nicht'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Atlassian Sans');
    await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Zum Inhalt springen'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
    await page.screenshot({path:`test-results/jira-issue-${width}.png`});await page.goto(`/jira/b/${jira.id}/boards/board`);await expect(page.locator('.jira-issue-card').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:`test-results/jira-board-${width}.png`});
    await page.goto(`/jira/b/${jira.id}/portal/portals`);await page.screenshot({path:`test-results/jira-portal-${width}.png`});
  }
});
test('Original-Jira-ZIP: Sollzahlen und repräsentative Jira-/JSM-Ansichten',async({page})=>{
  test.skip(!real,'Original-ZIP ist nicht installiert');test.setTimeout(120000);
  const report=await(await page.request.get(`/api/backups/${real.id}/jira/report`)).json();expect(report.counts).toMatchObject({projects:23,issues:48309,boards:17,serviceDesks:9,queues:143,files:0});
  expect((await page.request.post('/api/auth/jira-identities',{data:{backupId:real.id,jiraUserKey:'ug:00e3eadb-39eb-4552-b5dd-393346563980',externalId:'central-real-agent'}})).ok()).toBe(true);
  await page.request.post('/api/auth/switch',{data:{externalId:'central-real-agent'}});
  const projects=await(await page.request.get(`/api/backups/${real.id}/jira/projects`)).json();expect(projects.length).toBeGreaterThan(0);
  const issues=await(await page.request.get(`/api/backups/${real.id}/jira/search`)).json();expect(issues.total).toBeGreaterThan(1000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));const external=[];await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`/jira/b/${real.id}/projects`);await expect(page.getByRole('heading',{name:'Projekte',exact:true})).toBeVisible();await page.screenshot({path:'test-results/jira-real-projects.png'});
  await page.goto(`/jira/b/${real.id}/issues/${issues.items[0].key}`);await expect(page.getByRole('heading',{name:issues.items[0].summary,exact:true})).toBeVisible();await expect(page.locator('.jira-original-source a')).toHaveAttribute('href',`https://se-enterprise-demo.atlassian.net/browse/${issues.items[0].key}`);await page.screenshot({path:'test-results/jira-real-issue.png'});
  const boards=await(await page.request.get(`/api/backups/${real.id}/jira/boards`)).json();await page.goto(`/jira/b/${real.id}/boards/${boards[0].id}`);await expect(page.getByRole('heading',{name:boards[0].name,exact:true})).toBeVisible();await page.screenshot({path:'test-results/jira-real-board.png'});
  const queues=await(await page.request.get(`/api/backups/${real.id}/jira/queues`)).json();await page.goto(`/jira/b/${real.id}/queues/${queues[0].id}`);await expect(page.getByRole('heading',{name:queues[0].name,exact:true})).toBeVisible();await page.screenshot({path:'test-results/jira-real-queue.png'});
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('Ticketfelder, SLA-Archivwerte und Assets bleiben lesend und zugänglich',async({page,browser})=>{
  const api=`/api/backups/${jira.id}/jira/issues/HELP-1`;
  const original=await(await page.request.get(api)).json();
  const issue={...original,
    children:[{...original,id:'child',key:'HELP-3',summary:'Untervorgang'}],
    links:[{...original,id:'linked',key:'HELP-4',summary:'Verknüpfter Vorgang',relationship:'blockiert'}],
    fields:[...original.fields,
      {id:'test-user',name:'Weitere Person',type:'user',values:[{text:'Erika Muster'}]},
      {id:'test-date',name:'Testdatum',type:'date',values:[{text:'2026-09-12'}]},
      {id:'test-number',name:'Zahlenwert',type:'number',values:[{text:'0'}]},
      {id:'test-url',name:'Webadresse',type:'url',values:[{text:'https://example.com/'}]},
      {id:'test-empty',name:'Leeres Feld',type:'text',values:[]}],
    sla:[
      {id:'paused',name:'Pausierte Antwort',last_cycle_state:'paused',paused_cycle_elapsed_time:'3661000',paused_cycle_remaining_time:'0'},
      {id:'negative',name:'Negative Restzeit',last_cycle_state:'paused',paused_cycle_remaining_time:'-60000'},
      {id:'running',name:'Laufende Antwort',last_cycle_state:'running',last_complete_cycle_failed:'true',paused_cycle_remaining_time:'990000'},
      {id:'completed',name:'Abgeschlossene Antwort',last_cycle_state:'completed',last_complete_cycle_failed:'false'}]
  };
  await page.route(`**${api}`,route=>route.fulfill({json:issue}));
  await page.goto(`/jira/b/${jira.id}/issues/HELP-1`);
  const descriptionPanel=page.locator('.jira-content-panel').filter({has:page.getByRole('heading',{name:'Beschreibung',exact:true})});
  const attachmentsPanel=page.locator('.jira-content-panel').filter({has:page.getByRole('heading',{name:/Anhänge/})});
  await expect(descriptionPanel).toHaveCSS('border-style','solid');await expect(attachmentsPanel).toHaveCSS('border-style','solid');
  await descriptionPanel.locator('summary').click();await expect(descriptionPanel.locator('.storage-content')).toBeHidden();await descriptionPanel.locator('summary').click();await expect(descriptionPanel.locator('.storage-content')).toBeVisible();
  const panel=page.getByRole('complementary',{name:'Vorgangsdetails'});
  await expect(panel.locator('.jira-priority svg')).toBeVisible();
  await expect(panel.locator('.jira-user').first()).toBeVisible();
  await expect(page.getByRole('cell',{name:'Untervorgang',exact:true})).toBeVisible();
  await expect(page.locator('.jira-link-row')).toContainText('blockiert');
  const summary=panel.locator('summary').filter({hasText:'Weitere Felder'});
  await summary.focus();await page.keyboard.press('Enter');
  await expect(panel.getByText('Erika Muster')).toBeVisible();
  await expect(panel.locator('.jira-detail-row').filter({hasText:'Zahlenwert'}).locator('dd')).toHaveText('0');
  await expect(panel.getByText('12. Sept. 2026')).toBeVisible();
  await expect(panel.getByRole('link',{name:'https://example.com/'})).toHaveAttribute('href','https://example.com/');
  await expect(panel.getByText('Kein Wert im Export').first()).toBeVisible();
  await page.keyboard.press('Enter');await expect(panel.getByText('Erika Muster')).toBeHidden();
  const slas=panel.locator('.jira-slas');
  await expect(slas).toContainText('1 Std. 1 Min. 1 Sek.');await expect(slas).toContainText('0 Sek.');await expect(slas).toContainText('−1 Min.');
  const running=slas.locator('section').filter({hasText:'Laufende Antwort'});
  await expect(running).toContainText('Laufend');await expect(running).toContainText('Letzter abgeschlossener Zyklus');await expect(running).toContainText('Ziel verletzt');await expect(running).not.toContainText('16 Min.');
  await expect(slas).toContainText('Ziel eingehalten');await expect(slas).not.toContainText(' ms');
  await page.screenshot({path:'test-results/jira-ticket-desktop.png',fullPage:true});
  await page.setViewportSize({width:320,height:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/jira-ticket-narrow.png',fullPage:true});
  // 1440px at 200% browser zoom gives a 720px CSS viewport; CSS zoom alone does not reflow media queries.
  const zoomContext=await browser.newContext({viewport:{width:720,height:500},deviceScaleFactor:2,locale:'de-DE',storageState:await page.context().storageState()});
  const zoomPage=await zoomContext.newPage();
  await zoomPage.route(`**${api}`,route=>route.fulfill({json:issue}));
  await zoomPage.goto(`/jira/b/${jira.id}/issues/HELP-1`);
  await expect(zoomPage.getByRole('heading',{name:original.summary,exact:true})).toBeVisible();
  expect(await zoomPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await zoomPage.screenshot({path:'test-results/jira-ticket-200-percent.png',fullPage:true});
  await zoomContext.close();
  for(const label of ['Details','Zeitangaben','Archivierte SLAs']) {
    const toggle=panel.locator('summary').filter({hasText:label}),section=toggle.locator('..');
    const open=await section.evaluate(el=>el.open);
    await toggle.focus();await page.keyboard.press('Space');expect(await section.evaluate(el=>el.open)).toBe(!open);
    await page.keyboard.press('Space');expect(await section.evaluate(el=>el.open)).toBe(open);
  }
  const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))requests.push(r.url());});
  await page.goto(`/jira/b/${jira.id}/assets`);
  await expect(page.getByRole('heading',{name:'Assets',exact:true})).toBeVisible();
  await expect(page.getByText('Für dieses Archiv sind noch keine Assets-Daten verfügbar.')).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Jira-Navigation'}).getByRole('link',{name:'Assets'})).toHaveAttribute('aria-current','page');
  await page.getByRole('link',{name:'Zur Projektübersicht'}).click();await expect(page.getByRole('heading',{name:'Projekte',exact:true})).toBeVisible();
  expect(requests.filter(url=>url.includes('/assets'))).toEqual([]);
  await page.request.post('/api/auth/switch',{data:{externalId:'central-customer'}});
  await page.goto(`/jira/b/${jira.id}/portal/requests/HELP-1`);
  await expect(page.getByRole('heading',{name:'Laptop startet nicht',exact:true})).toBeVisible();
  await expect(page.locator('.jira-slas')).toHaveCount(0);await expect(page.getByRole('link',{name:'Assets',exact:true})).toHaveCount(0);
  expect(await(await page.request.get(`/api/backups/${jira.id}/jira/portal/requests/HELP-1`)).json()).not.toHaveProperty('sla');
});
