import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { compose } from 'node:stream';
import { zstdCompressSync } from 'node:zlib';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { csvParser,decodeBody,validEntry,openArchive } from '../server/archive.mjs';
import { loadBackups,versionRoots,get,all } from '../server/import.mjs';
import { resolveLink,renderContent,sanitizeRendered,parseLocalCql,plainText,decodeStorageText } from '../server/render.mjs';
import { writeFixtures,fixtureEntries,zipBytes,PAGE_ID } from './fixture.mjs';
import { originalContentUrl,siteOrigin } from '../server/original-links.mjs';

test('CSV: BOM, Kommas, Anführungszeichen, Zeilenumbrüche und große IDs bleiben erhalten',async()=>{
  const rows=await Array.fromAsync(compose(Readable.from(['\ufeffID,TEXT\r\n9007199254740993,"Hallo, ""Welt""\nzweite Zeile"\r\n']),csvParser()));
  assert.deepEqual(rows,[{id:PAGE_ID,text:'Hallo, "Welt"\nzweite Zeile'}]);
  await assert.rejects(async()=>Array.fromAsync(compose(Readable.from(['a,b\n1,2,3']),csvParser())));
  const docs=await Array.fromAsync(compose(Readable.from(['contentId,documentId,spaceId,documentType,data\n000000,1\n']),csvParser(true)));
  assert.deepEqual(docs,[]);
  await assert.rejects(async()=>Array.fromAsync(compose(Readable.from(['contentId,documentId,spaceId,documentType,data\nbad,record\n']),csvParser(true))));
});
test('Node dekodiert Base64/Zstandard einschließlich Unicode und lehnt beschädigte Daten ab',()=>{
  const source='<p>Grüße 👋 &amp; Wissen</p>';
  assert.equal(decodeBody(zstdCompressSync(Buffer.from(source)).toString('base64')),source);
  assert.equal(decodeBody(''),'');
  assert.throws(()=>decodeBody('!ungültig!'));
  assert.throws(()=>decodeBody(Buffer.from('kein zstd').toString('base64')));
});
test('prevver zeigt auf die Hauptversion; Zyklen und fehlende Ziele werden gemeldet',()=>{
  const warnings=[];
  const roots=versionRoots([{contentid:'current',prevver:''},{contentid:'old',prevver:'current'},{contentid:'older',prevver:'old'},{contentid:'missing',prevver:'absent'},{contentid:'cycle',prevver:'cycle'}],(...args)=>warnings.push(args));
  assert.equal(roots.get('old'),'current');assert.equal(roots.get('older'),'current');assert.equal(warnings.length,2);
});
test('Archivpfade erlauben nur sichere relative Einträge',async()=>{
  for(const name of ['attachments/uuid','data/content.csv.gz'])assert.equal(validEntry(name),true);
  for(const name of ['../secret','/etc/passwd','C:/secret','a/../secret','a\\secret','a/./secret','a\0secret'])assert.equal(validEntry(name),false,name);
  const dir=await mkdtemp(path.join(os.tmpdir(),'confluence-path-test-'));
  try{const file=path.join(dir,'unsafe.zip');await writeFile(file,zipBytes({'../secret':'data'}));await assert.rejects(()=>openArchive(file));}
  finally{await rm(dir,{recursive:true,force:true});}
});
test('HTML-Bereinigung entfernt aktive Inhalte, Eventhandler und unsichere URLs',()=>{
  const html=sanitizeRendered('<script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="https://evil.test/a" onerror="alert(1)"><a href="javascript:alert(1)">Unsicher</a><p style="background-image:url(https://evil.test);color:#123456" onclick="alert(1)">Text</p><input checked><img src="/api/backups/abc/attachments/123">');
  assert.doesNotMatch(html,/<script|<iframe|onerror|onclick|javascript:|background-image/);
  assert.match(html,/color:#123456/);assert.match(html,/disabled/);assert.match(html,/\/api\/backups\/abc\/attachments\/123/);
  assert.match(html,/src="https:\/\/evil\.test\/a"/);
});
test('Lokales CQL akzeptiert nur vollständige Label-/Bereichs-/Typfilter',()=>{
  assert.deepEqual(parseLocalCql('label in ("email", "gmail") and type = "page" and space = "ITS"'),[{field:'label',values:['email','gmail']},{field:'type',values:['page']},{field:'space',values:['ITS']}]);
  assert.deepEqual(parseLocalCql('label = "requirements" and space = currentSpace ( )'),[{field:'label',values:['requirements']},{field:'space',values:null}]);
  for(const q of ['label="x" OR type="page"','label="x" garbage','label="x" and','text ~ "x"', 'space = currentUser()'])assert.equal(parseLocalCql(q),null);
});
test('Suchtext trennt HTML-Blöcke und erhält Wörter sowie Code in CDATA',()=>{
  assert.equal(plainText('<h2>Überblick</h2><p>Einzigartiger <strong>Suchinhalt</strong>.</p>'),'Überblick Einzigartiger Suchinhalt.');
  assert.match(plainText('<ac:plain-text-body><![CDATA[console.log("code")]]></ac:plain-text-body>'),/console.log/);
});
test('Storage-Text dekodiert Unicode-Escapes und HTML-Leerzeichen',()=>{
  assert.equal(decodeStorageText('\\uD83D\\uDDD3&nbsp;Date'), '🗓 Date');
  assert.equal(decodeStorageText('What&rsquo;s next?'), 'What’s next?');
  assert.equal(decodeStorageText('Real&mdash;time editing'), 'Real—time editing');
  const html=renderContent('<h2><ac:emoticon ac:emoji-fallback="\\uD83D\\uDDD3" />&nbsp;Date</h2>', { db: { prepare: () => ({ all:()=>[], get:()=>undefined }) }, backupId:'test', content:{ id:'1', root_id:'1', space_id:'' } });
  assert.match(html,/🗓/);assert.match(html,/Date/);assert.doesNotMatch(html,/\\uD83D|&nbsp;/);
});
test('Original-Links entstehen nur mit bekannter Instanz und verweisen bei Historie auf die Hauptversion',()=>{
  const row={id:'1736784',type:'PAGE',title:'Project Update - Compliance Assessment Report'};
  assert.equal(originalContentUrl('https://sva-aldi-demo.atlassian.net',row,{key:'S'}),'https://sva-aldi-demo.atlassian.net/wiki/spaces/S/pages/1736784/Project+Update+-+Compliance+Assessment+Report');
  assert.equal(originalContentUrl(null,row,{key:'S'}),null);
  assert.equal(originalContentUrl('https://site.test',{id:'old',type:'PAGE'},{key:'S'},row),'https://site.test/wiki/spaces/S/pages/1736784/Project+Update+-+Compliance+Assessment+Report');
  for(const source of ['javascript:alert(1)','https://user:secret@site.test','https://site.test/other?x=1'])assert.equal(siteOrigin(source),null);
});
test('Atomarer Import, Backup-Trennung, FTS, Links, Makros und Cache-Neustart',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'confluence-import-test-'));
  const options={backupDir:dir,cacheDir:path.join(dir,'cache'),rootDir:dir,includeRoot:false};
  let backups;
  const close=()=>{for(const b of backups?.values()||[]){b.db?.close();b.archive?.close();}};
  try{
    await writeFixtures(dir);backups=await loadBackups(options);
    const [alpha,beta,bad]=[...backups.values()];assert.equal(backups.size,3);assert.ok(bad.error);assert.notEqual(alpha.id,beta.id);
    assert.equal(get(alpha.db,'SELECT title FROM content WHERE id=?',PAGE_ID).title,'Testwissen Alpha');
    assert.equal(get(beta.db,'SELECT title FROM content WHERE id=?',PAGE_ID).title,'Testwissen Beta');
    assert.equal(get(alpha.db,"SELECT space_id FROM content WHERE id='old1'").space_id,'s1');
    assert.equal(alpha.report.counts.files,2);assert.equal(alpha.report.counts.versions,1);assert.equal(alpha.report.warnings.length,0);
    assert.equal(all(alpha.db,"SELECT content_id FROM search WHERE search MATCH 'grüße'")[0].content_id,PAGE_ID);
    assert.equal(all(alpha.db,"SELECT content_id FROM search WHERE search MATCH 'Einzigartiger'")[0].content_id,PAGE_ID);
    const context={db:alpha.db,backupId:alpha.id,content:get(alpha.db,'SELECT * FROM content WHERE id=?',PAGE_ID)};
    assert.equal(resolveLink(`https://example.atlassian.net/wiki/spaces/TEST/pages/${PAGE_ID}/Test#Überblick`,context).href,`/b/${alpha.id}/content/${PAGE_ID}#%C3%9Cberblick`);
    assert.equal(resolveLink('/display/TEST/Unterseite',context).href,`/b/${alpha.id}/content/child`);
    assert.equal(resolveLink(`/download/attachments/${PAGE_ID}/aktiv.html`,context).href,`/api/backups/${alpha.id}/attachments/attachment`);
    assert.ok(resolveLink('/wiki/spaces/TEST/pages/404/Fehlt',context).missing);
    assert.ok(resolveLink('javascript:alert(1)',context).missing);
    assert.equal(resolveLink('#Überblick',context).href,'#Überblick');
    const body=get(alpha.db,'SELECT body FROM bodies WHERE content_id=?',PAGE_ID).body;
    const html=renderContent(body,context);
    for(const expected of ['layout-two_equal','<details','<summary>Mehr Wissen','if (a &lt; 2)','Gespeicherte Jira-Daten','TEST-1','checked','disabled',`/b/${alpha.id}/content/child`,`/api/backups/${alpha.id}/attachments/image`])assert.ok(html.includes(expected),expected);
    assert.doesNotMatch(html,/<ac:|<ri:/);
    close();backups=await loadBackups(options);assert.equal([...backups.values()][0].cached,true);assert.equal([...backups.values()][1].cached,true);
    const cacheFile=path.join(options.cacheDir,`${alpha.id}.sqlite`), before=await readFile(cacheFile);
    close();const entries=fixtureEntries('Geändert');entries['data/content.csv.gz']=Buffer.from('beschädigtes gzip');await writeFile(path.join(dir,'alpha.zip'),zipBytes(entries));
    backups=await loadBackups(options);assert.ok(backups.get(alpha.id).error);assert.ok(backups.get(beta.id).db);assert.deepEqual(await readFile(cacheFile),before);
    close();await writeFile(path.join(dir,'alpha.zip'),zipBytes(fixtureEntries('Geändert')));backups=await loadBackups(options);assert.equal(backups.get(alpha.id).cached,false);assert.equal(get(backups.get(alpha.id).db,'SELECT title FROM content WHERE id=?',PAGE_ID).title,'Geändert');
  }finally{close();await rm(dir,{recursive:true,force:true});}
});
