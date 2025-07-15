import sanitizeHtml from 'sanitize-html';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderJira(value, {db,backupId,portal=false} = {}) {
  const esc=escapeHtml;
  const link = href => {
    if(typeof href!=='string')return '';
    const match=/(?:^|\/browse\/)([A-Z][A-Z0-9_]*-\d+)(?:$|[?#])/.exec(href);
    if(match && db?.prepare('SELECT 1 FROM issues WHERE key=? COLLATE NOCASE').get(match[1]))return `/jira/b/${encodeURIComponent(backupId)}/${portal?'portal/requests':'issues'}/${encodeURIComponent(match[1])}`;
    try {const url=new URL(href);return ['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return href.startsWith('#')?href:'';}
  };
  const anchor=(href,label)=>{const safe=link(href);return safe?`<a href="${esc(safe)}"${safe.startsWith('http')?' target="_blank" rel="noopener noreferrer"':''}>${label}</a>`:label;};
  let nodes=0;
  function adf(n,depth=0) {
    if(!n||depth>50||++nodes>50000)return '<p>Inhalt ist zu groß für die Vorschau.</p>';
    const children=()=>Array.isArray(n.content)?n.content.map(c=>adf(c,depth+1)).join(''):'';
    if(n.type==='text') {
      let result=esc(n.text);
      for(const mark of n.marks||[]) {
        const tag={strong:'strong',em:'em',strike:'s',code:'code',underline:'u'}[mark.type];
        if(tag)result=`<${tag}>${result}</${tag}>`;
        if(mark.type==='link')result=anchor(mark.attrs?.href,result);
      }
      return result;
    }
    const tags={doc:'div',paragraph:'p',blockquote:'blockquote',bulletList:'ul',orderedList:'ol',listItem:'li',table:'table',tableRow:'tr',tableCell:'td',tableHeader:'th',panel:'aside',expand:'details',nestedExpand:'details'};
    if(tags[n.type]) {const tag=tags[n.type];return `<${tag}>${tag==='details'?`<summary>${esc(n.attrs?.title||'Details')}</summary>`:''}${children()}</${tag}>`;}
    if(n.type==='heading'){const level=Math.min(6,Math.max(2,Number(n.attrs?.level)||2));return `<h${level}>${children()}</h${level}>`;}
    if(n.type==='hardBreak')return '<br>';
    if(n.type==='rule')return '<hr>';
    if(n.type==='codeBlock')return `<pre><code>${children()}</code></pre>`;
    if(n.type==='mention')return esc(n.attrs?.text||n.attrs?.id||'Erwähnung');
    if(n.type==='emoji')return esc(n.attrs?.text||n.attrs?.shortName||'Emoji');
    if(n.type==='date')return esc(Number.isFinite(Number(n.attrs?.timestamp))?new Date(Number(n.attrs.timestamp)).toISOString().slice(0,10):'Datum unbekannt');
    if(n.type==='status')return `<strong>${esc(n.attrs?.text)}</strong>`;
    if(n.type==='inlineCard'||n.type==='blockCard')return anchor(n.attrs?.url,esc(n.attrs?.url));
    if(n.type==='media'||n.type==='mediaSingle'||n.type==='mediaGroup')return `<p>Medienvorschau nicht im Export verfügbar${n.attrs?.alt?`: ${esc(n.attrs.alt)}`:''}.</p>`;
    if(n.type==='taskItem')return `<p><input type="checkbox" disabled${n.attrs?.state==='DONE'?' checked':''}> ${children()}</p>`;
    if(n.type==='taskList')return children();
    return `<aside>Nicht unterstütztes Element: ${esc(n.type||'unbekannt')}${children()}</aside>`;
  }
  const inline = source => esc(source)
    .replace(/\[([^\]\n]+)\]/g,(whole,body)=>{const [label,url]=body.split('|');return anchor((url||label).replaceAll('&amp;','&'),esc('').concat(label));})
    .replace(/\{\{([^}]+)\}\}/g,'<code>$1</code>').replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>').replace(/_([^_\n]+)_/g,'<em>$1</em>');
  function wiki(source) {
    const parts=String(source).split(/(\{(?:code(?::[^}]*)?|noformat)\}[\s\S]*?\{(?:code|noformat)\})/g);
    return parts.map(part=>{
      if(/^\{(?:code|noformat)/.test(part))return `<pre><code>${esc(part.replace(/^\{[^}]+\}|\{(?:code|noformat)\}$/g,''))}</code></pre>`;
      let table=false,list='',out='';
      for(const line of part.split(/\r?\n/)) {
        if(line.startsWith('|')){if(list){out+=`</${list}>`;list='';}if(!table){out+='<table>';table=true;}const header=line.startsWith('||'),tag=header?'th':'td';out+=`<tr>${line.replace(/^\|+|\|+$/g,'').split(header?'||':'|').map(c=>`<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`;continue;}
        if(table){out+='</table>';table=false;}
        const li=/^([*#]+)\s+(.*)$/.exec(line);
        if(li){const type=li[1][0]==='*'?'ul':'ol';if(list!==type){if(list)out+=`</${list}>`;out+=`<${type}>`;list=type;}out+=`<li>${inline(li[2])}</li>`;continue;}
        if(list){out+=`</${list}>`;list='';}
        const heading=/^h([1-6])\.\s+(.*)$/.exec(line);
        out+=heading?`<h${Math.max(2,Number(heading[1]))}>${inline(heading[2])}</h${Math.max(2,Number(heading[1]))}>`:line?`<p>${inline(line)}</p>`:'<br>';
      }
      return out+(table?'</table>':'')+(list?`</${list}>`:'');
    }).join('');
  }
  let document=value;
  if(typeof value==='string' && value.trim().startsWith('{'))try{document=JSON.parse(value);}catch{}
  const html=document&&typeof document==='object'?adf(document):wiki(value||'');
  return sanitizeHtml(html,{allowedTags:['div','p','br','hr','h2','h3','h4','h5','h6','strong','em','s','u','code','pre','blockquote','ul','ol','li','table','tr','td','th','aside','details','summary','a','input'],allowedAttributes:{a:['href','target','rel'],input:['type','disabled','checked']},allowedSchemes:['http','https','mailto'],allowProtocolRelative:false});
}
