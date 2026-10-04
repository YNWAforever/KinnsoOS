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
  if(response.status!==200) throw new Error(`Sitemap ${response.status}: ${url}`);
  return response.text();
}
export async function inventory(start=origin+'/sitemap.xml') {
  const scope=new URL(approvedUrl(start)).origin;
  const visited=new Set(),urls=new Set();
  async function crawl(url) {
    if(visited.has(url)) throw new Error('Repeated/cyclic sitemap');
    if(visited.size>=50) throw new Error('Sitemap shard limit');
    visited.add(url); const xml=await read(approvedUrl(url,scope)),locs=locations(xml,scope);
    if(/<sitemapindex\b/.test(xml)) {for(const loc of locs) await crawl(loc);}
    else for(const loc of locs) urls.add(loc);
  }
  await crawl(start); return {shards:[...visited],urls:[...urls].sort()};
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
  const start=approvedUrl(process.argv[4]??origin+'/sitemap.xml'),scope=new URL(start).origin;
  let data;
  try{data=await inventory(start);}catch(error){
    const responses=[];for(const suffix of ['/en','/zh-hk','/sitemap.xml'])responses.push(await baseline(scope+suffix));
    await writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),source:start,inventoryStatus:'blocked',reason:error.message,coverage:{inventoried:null,responseChecked:responses.length,unchecked:null},responses,mappings:responses.filter(r=>r.status===200&&!r.url.endsWith('/sitemap.xml')).map(r=>({oldUrl:r.url,newUrl:r.url,disposition:'retain',reason:'Actual original route remains available. Full published URL inventory is unavailable.'})),limitation:'No complete published URL inventory or content migration parity is claimed. A different website sitemap cannot prove this application route set.'},null,2));
    console.log(JSON.stringify({inventoryStatus:'blocked',source:start,responseChecked:responses.length,output}));process.exitCode=1;return;
  }
  const count=process.argv[3]==='all'?data.urls.length:Number(process.argv[3]??14);
  if(!Number.isInteger(count)||count<1) throw new Error('Invalid sample count');
  const sample=data.urls.filter((_,i)=>i%Math.max(1,Math.floor(data.urls.length/count))===0).slice(0,count);
  const responses=[]; for(const url of sample) responses.push(await baseline(url));
  const mappings=data.urls.map(oldUrl=>({oldUrl,newUrl:oldUrl,disposition:'retain',reason:'Legacy still serves this public URL. Unified SSR content parity is not verified; canonical handoff pending.'}));
  await writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),source:start,inventoryStatus:'inventoried',...data,mappings,
    coverage:{inventoried:data.urls.length,responseChecked:responses.length,unchecked:data.urls.length-responses.length},responses},null,2));
  console.log(JSON.stringify({inventoried:data.urls.length,responseChecked:responses.length,failures:responses.filter(r=>r.error||r.status!==200).length,output}));
  if(responses.some(r=>r.error||r.status!==200)) process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
