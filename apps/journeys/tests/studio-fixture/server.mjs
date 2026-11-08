// Offline UI fixture: actual React surfaces, boundary-only router/context doubles.
// No DB, model, OAuth or provider execution; all API calls are intercepted by tests.
import http from 'node:http';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const result=await build({absWorkingDir:root,entryPoints:['tests/studio-fixture/entry.tsx'],bundle:true,write:false,outdir:'fixture-output',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture-boundaries',setup(b){
 b.onResolve({filter:/^(next\/link|next\/navigation)$/},args=>({path:args.path,namespace:'boundary'}));
 b.onResolve({filter:/(?:^\.\/ui$|\/travel\/ui$)/},()=>({path:'app-context',namespace:'boundary'}));
 b.onLoad({filter:/.*/,namespace:'boundary'},args=>({resolveDir:root,loader:'tsx',contents:args.path==='next/link'?`export default function Link({href,children,onClick,...props}){return <a {...props} href={href} onClick={event=>{onClick?.(event);if(event.defaultPrevented||event.button||event.metaKey||event.ctrlKey)return;event.preventDefault();window.fixtureNavigate(href);}}>{children}</a>}`:args.path==='next/navigation'?`const router={push:url=>window.fixtureNavigate(url),replace:url=>window.fixtureNavigate(url),refresh:()=>{}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;`:`export const useApp=()=>({locale:'zh-HK',t:(en,zh)=>zh,href:path=>'/zh-HK/'+path});export const Modal=({children,title,onClose})=><div role="dialog"><h2>{title}</h2>{children}<button onClick={onClose}>關閉</button></div>;`}));
 }}]});
const assets=new Map(result.outputFiles.map(file=>['/'+path.basename(file.path),file.contents]));
const html='<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOCAL FIXTURE · KinnsoOS</title><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>';
http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,code:'UNAVAILABLE',retryable:true}));return;}const file=assets.get(url.pathname);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file?url.pathname.endsWith('.css')?'text/css':'text/javascript':'text/html');res.end(file??html);}).listen(3497,'127.0.0.1',()=>process.stdout.write('Studio fixture on loopback 3497; no real backend\n'));
