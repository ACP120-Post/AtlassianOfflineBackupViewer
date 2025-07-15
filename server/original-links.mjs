export function siteOrigin(value) {
  try {
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!['/','/wiki','/wiki/'].includes(url.pathname))return null;
    return url.origin;
  }catch{return null;}
}

export function originalContentUrl(site, content, space, root=content) {
  const origin=siteOrigin(site);
  if(!origin)return null;
  if(content.type==='PAGE'&&space?.key) {
    const title=encodeURIComponent(root.title||'').replaceAll('%20','+');
    return `${origin}/wiki/spaces/${encodeURIComponent(space.key)}/pages/${encodeURIComponent(root.id)}/${title}`;
  }
  if(content.type==='BLOGPOST')return `${origin}/wiki/pages/viewpage.action?pageId=${encodeURIComponent(root.id)}`;
  // Other content types need a verified deep-link format; the instance link remains available.
 return null;
}

export function originalIssueUrl(site, key) {
 const origin=siteOrigin(site);
 return origin&&key ? `${origin}/browse/${encodeURIComponent(key)}` : null;
}
