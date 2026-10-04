import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const origin='https://remix-kinnso-web.vercel.app';
const allowedOrigins=new Set([origin,'https://www.kinnso.ai']);
export function approvedUrl(value,scope) {
  const u=new URL(value);
  if(!allowedOrigins.has(u.origin)||(scope&&u.origin!==scope)||u.username||u.password||u.search||u.hash) throw new Error('Offsite or unsafe sitemap URL');
  return u.href;
}
export function xmlEscape(value) {return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
export function locations(xml,scope) {
  if(!/<(?:sitemapindex|urlset)\b/.test(xml)) throw new Error('Not a sitemap');
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m=>approvedUrl(m[1].replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'"),scope));
}
async function read(url) {
  const response=await fetch(approvedUrl(url),{redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.status!==200) {
    const error=new Error(`Sitemap ${response.status}: ${url}`);
    error.status=response.status; throw error;
  }
  return response.text();
}
export async function inventory(start) {
  const requestedSource=approvedUrl(start??origin+'/sitemap.xml');
  const scope=new URL(requestedSource).origin;
  let roots=[requestedSource],method=start?'explicit':'flat',robotsSource=null;
  const documents=new Map();
  try {documents.set(requestedSource,await read(requestedSource));}
  catch(error) {
    // Next's generateSitemaps exposes shards rather than a flat sitemap.
    // Only an absent default triggers discovery; errors and explicit inputs stay errors.
    if(start||error.status!==404) throw error;
    robotsSource=scope+'/robots.txt';
    const robots=await read(robotsSource);
    roots=[...new Set([...robots.matchAll(/^\s*sitemap\s*:\s*([^\s#]+)[^\r\n]*$/gim)]
      .map(m=>approvedUrl(m[1],scope)))];
    if(!roots.length) throw new Error('No same-origin sitemap advertised by robots');
    method='robots';
  }
  const visited=new Set(),active=new Set(),urls=new Set();
  async function crawl(url) {
    if(active.has(url)) throw new Error('Repeated/cyclic sitemap');
    if(visited.has(url)) return;
    if(visited.size>=50) throw new Error('Sitemap shard limit');
    visited.add(url); active.add(url);
    try {
      const xml=documents.get(url)??await read(approvedUrl(url,scope)),locs=locations(xml,scope);
      if(/<sitemapindex\b/.test(xml)) {for(const loc of locs) await crawl(loc);}
      else for(const loc of locs) urls.add(loc);
    } finally {active.delete(url);}
  }
  for(const root of roots) await crawl(root);
  if(!urls.size) throw new Error('Empty sitemap inventory');
  return {shards:[...visited],urls:[...urls].sort(),discovery:{requestedSource,method,robotsSource}};
}
export async function baseline(url) {
  try {
    const r=await fetch(approvedUrl(url),{redirect:'manual',signal:AbortSignal.timeout(20000)});
    const html=await r.text();
    const tags=[...html.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(m=>m[0]);
    const attr=(tag,name)=>tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]??null;
    return {url,status:r.status,location:r.headers.get('location'),canonical:attr(tags.find(t=>attr(t,'rel')==='canonical')??'','href'),
      robots:attr(tags.find(t=>attr(t,'name')?.toLowerCase()==='robots')??'','content'),headerRobots:r.headers.get('x-robots-tag'),
      title:html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??null,
      ogTitle:attr(tags.find(t=>attr(t,'property')==='og:title')??'','content')};
  } catch(error) {return {url,error:error.message};}
}
async function main() {
  const output=process.argv[2]; if(!output) throw new Error('Usage: node scripts/check-url-parity.mjs PRIVATE_OUTPUT.json [sample-count|all]');
  const start=process.argv[4]?approvedUrl(process.argv[4]):undefined,source=start??origin+'/sitemap.xml',scope=new URL(source).origin;
  let data;
  try{data=await inventory(start);}catch(error){
    const responses=[];for(const suffix of ['/en','/zh-hk','/sitemap.xml'])responses.push(await baseline(scope+suffix));
    await writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),source,inventoryStatus:'blocked',reason:error.message,coverage:{inventoried:null,responseChecked:responses.length,unchecked:null},responses,mappings:responses.filter(r=>r.status===200&&!r.url.endsWith('/sitemap.xml')).map(r=>({oldUrl:r.url,newUrl:r.url,disposition:'retain',reason:'Actual original route remains available. Full published URL inventory is unavailable.'})),limitation:'No complete published URL inventory or content migration parity is claimed. A different website sitemap cannot prove this application route set.'},null,2));
    console.log(JSON.stringify({inventoryStatus:'blocked',source,responseChecked:responses.length,output}));process.exitCode=1;return;
  }
  const count=process.argv[3]==='all'?data.urls.length:Number(process.argv[3]??14);
  if(!Number.isInteger(count)||count<1) throw new Error('Invalid sample count');
  const sample=data.urls.filter((_,i)=>i%Math.max(1,Math.floor(data.urls.length/count))===0).slice(0,count);
  const responses=[]; for(const url of sample) responses.push(await baseline(url));
  const mappings=data.urls.map(oldUrl=>({oldUrl,newUrl:oldUrl,disposition:'retain',reason:'Original sitemap advertises this URL; response outcomes are recorded separately. Preserve original canonical pending verified unified content parity.'}));
  await writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),source,inventoryStatus:'inventoried',...data,mappings,
    limitation:'Inventory covers the advertised same-origin sitemap only. Response checks do not prove unified content-ID parity, unlisted routes, or indexing launch approval.',
    coverage:{inventoried:data.urls.length,responseChecked:responses.length,unchecked:data.urls.length-responses.length},responses},null,2));
  console.log(JSON.stringify({inventoried:data.urls.length,responseChecked:responses.length,failures:responses.filter(r=>r.error||r.status!==200).length,output}));
  if(responses.some(r=>r.error||r.status!==200)) process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
