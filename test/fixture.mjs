import { gzipSync, zstdCompressSync, crc32 } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Minimal, stored ZIP records keep test archives reproducible without a ZIP-writing dependency.
export function zipBytes(entries) {
  const local=[], central=[]; let offset=0;
  for(const [filename,input] of Object.entries(entries)) {
    const name=Buffer.from(filename), data=Buffer.from(input), crc=crc32(data);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    local.push(header,name,data);
    const index=Buffer.alloc(46);index.writeUInt32LE(0x02014b50);index.writeUInt16LE(20,4);index.writeUInt16LE(20,6);index.writeUInt32LE(crc,16);index.writeUInt32LE(data.length,20);index.writeUInt32LE(data.length,24);index.writeUInt16LE(name.length,28);index.writeUInt32LE(offset,42);
    central.push(index,name);offset+=header.length+name.length+data.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
export function csv(rows,headers=Object.keys(rows[0] || {})) {
  const quote=value=>`"${String(value??'').replaceAll('"','""')}"`;
  return headers.join(',')+'\r\n'+rows.map(row=>headers.map(key=>quote(row[key])).join(',')).join('\r\n')+'\r\n';
}
export const PAGE_ID='9007199254740993';
export function fixtureEntries(title='Testwissen Alpha') {
  const page={contentid:PAGE_ID,contenttype:'PAGE',title,version:'3',prevver:'',content_status:'current',spaceid:'s1',parentid:'',pageid:'',creator:'u1',lastmodifier:'u1',creationdate:'2026-09-01T10:00:00Z',lastmoddate:'2026-09-10T10:00:00Z',child_position:'0',draftpageid:'',parentcommentid:'',versioncomment:''};
  const content=[page,
    {...page,contentid:'old1',title:'Historische Geheimnotiz',version:'2',prevver:PAGE_ID,spaceid:''},
    {...page,contentid:'child',title:'Unterseite',parentid:PAGE_ID},
    {...page,contentid:'draft',title:'Entwurf',content_status:'draft',prevver:PAGE_ID},
    {...page,contentid:'archived',title:'Archivseite',content_status:'archived'},
    {...page,contentid:'deleted',title:'Gelöschte Seite',content_status:'deleted'},
    {...page,contentid:'comment',contenttype:'COMMENT',title:'',pageid:PAGE_ID},
    {...page,contentid:'attachment',contenttype:'ATTACHMENT',title:'aktiv.html',pageid:PAGE_ID},
    {...page,contentid:'image',contenttype:'ATTACHMENT',title:'bild.png',pageid:PAGE_ID},
    {...page,contentid:'database',contenttype:'DATABASE',title:'Testdatenbank'},
    {...page,contentid:'whiteboard',contenttype:'WHITEBOARD',title:'Testwhiteboard'},
  ];
  const body=`<ac:layout><ac:layout-section ac:type="two_equal"><ac:layout-cell><h2>Überblick</h2><p>Einzigartiger Suchinhalt mit Umlauten: Grüße.</p><ac:structured-macro ac:name="toc"/><ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[if (a < 2) console.log("ok");]]></ac:plain-text-body></ac:structured-macro></ac:layout-cell><ac:layout-cell><ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Mehr Wissen</ac:parameter><ac:rich-text-body><p>Gespeicherter Text</p></ac:rich-text-body></ac:structured-macro><ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">TEST-1</ac:parameter><ac:rich-text-body><p>Gespeicherte Jira-Daten</p></ac:rich-text-body></ac:structured-macro></ac:layout-cell></ac:layout-section></ac:layout><ac:link><ri:page ri:content-title="Unterseite"/><ac:plain-text-link-body><![CDATA[Zur Unterseite]]></ac:plain-text-link-body></ac:link><ac:image><ri:attachment ri:filename="bild.png"/></ac:image><ac:task-list><ac:task><ac:task-status>complete</ac:task-status><ac:task-body>Erledigt</ac:task-body></ac:task></ac:task-list>`;
  const bodies=content.filter(c=>c.contenttype==='PAGE'||c.contenttype==='COMMENT').map((c,i)=>({bodycontentid:String(i),contentid:c.contentid,body:zstdCompressSync(Buffer.from(c.contentid===PAGE_ID?body:c.contentid==='comment'?'<p>Ein gespeicherter Kommentar</p>':`<p>${c.title}</p>`)).toString('base64'),bodytypeid:'2'}));
  const data={fields:['name'],fieldsById:{name:{name:'Name'}},entries:['e1'],entriesById:{e1:{values:{name:'Gespeicherter Eintrag'}}}};
  return {
    'data/spaces.csv.gz':gzipSync(csv([{spaceid:'s1',spacename:'Testbereich',spacekey:'TEST',homepage:PAGE_ID,spacestatus:'CURRENT'}])),
    'data/content.csv.gz':gzipSync(csv(content)),
    'data/bodycontent.csv.gz':gzipSync(csv(bodies)),
    'data/user_mapping.csv.gz':gzipSync(csv([{user_key:'u1',username:'Testautor'}])),
    'data/label.csv.gz':gzipSync(csv([{labelid:'l1',name:'wissen'}])),
    'data/content_label.csv.gz':gzipSync(csv([{contentid:PAGE_ID,labelid:'l1'}])),
    'data/contentproperties.csv.gz':gzipSync(csv([{contentid:'attachment',propertyname:'FILESTORE_ID',stringval:'active'}, {contentid:'image',propertyname:'FILESTORE_ID',stringval:'picture'}])),
    'attachments/active':Buffer.from('<script>alert("test")</script>'),
    'attachments/picture':Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64'),
    'whiteboards/data/whiteboardExport_1.csv':Buffer.from(csv([{contentId:'database',documentId:'d1',spaceId:'s1',documentType:'database',data:Buffer.from(JSON.stringify(data)).toString('base64')}])+'000000,1\r\n'),
  };
}
export async function writeFixtures(directory) {
  await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'alpha.zip'),zipBytes(fixtureEntries()));
  await writeFile(path.join(directory,'beta.zip'),zipBytes(fixtureEntries('Testwissen Beta')));
  await writeFile(path.join(directory,'kaputt.zip'),'Kein ZIP');
}
