// Standalone loopback-only preview. No .env loading, DB drivers, Next server or providers.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createExampleBackend} from './mock-backend.mjs';
import {SAMPLE_PNG} from './traveller-backend.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const appRoot = path.join(root, 'apps/journeys');
const require = createRequire(path.join(appRoot, 'package.json'));
const {build} = require('esbuild');
const port = Number(process.argv[2]??3499), host = '127.0.0.1', origin = `http://${host}:${port}`;
if(![3499,3500,3501].includes(port))throw Error('Only the local review/test ports are supported.');
const result = await build({absWorkingDir: appRoot, nodePaths:[path.join(appRoot,'node_modules')], stdin: {contents: await readFile(new URL('entry.tsx', import.meta.url), 'utf8'), sourcefile: 'local-studio-preview.tsx', resolveDir: appRoot, loader: 'tsx'}, bundle: true, write: false, outfile: 'preview.js', format: 'esm', jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}, plugins: [{name: 'local-preview-boundaries', setup(b) {
  b.onResolve({filter: /(?:^\.\/local-drafts$|\/trips\/local-drafts$)/},()=>({path:fileURLToPath(new URL('memory-cache.ts',import.meta.url))}));
  b.onResolve({filter: /^(next\/link|next\/navigation|next\/image)$/}, args => ({path: args.path, namespace: 'boundary'}));
  b.onResolve({filter: /(?:^\.\/ui$|\/travel\/ui$)/}, () => ({path: 'app-context', namespace: 'boundary'}));
  b.onLoad({filter: /.*/, namespace: 'boundary'}, args => ({resolveDir: appRoot, loader: 'tsx', contents: args.path === 'next/image' ? `export default function Image({fill,priority,unoptimized,loader,quality,placeholder,blurDataURL,...props}){return <img {...props}/>}` : args.path === 'next/link' ? `export default function Link({href,children,...props}){return <a {...props} href={href} onClick={event=>{if(event.button||event.metaKey||event.ctrlKey)return;event.preventDefault();window.fixtureNavigate(href);}}>{children}</a>}` : args.path === 'next/navigation' ? `const router={push:url=>window.fixtureNavigate(url),replace:url=>window.fixtureNavigate(url),refresh:()=>{}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;` : `export const useApp=()=>({locale:'zh-HK',ready:true,t:(en,zh)=>zh,href:path=>'/zh-HK/'+path});export const Modal=({children,title,onClose})=><div role="dialog"><h2>{title}</h2>{children}<button onClick={onClose}>關閉</button></div>;`}));
}}]});
const assets = new Map(result.outputFiles.map(f => ['/' + path.basename(f.path), f.contents]));
const previewCss = `.preview-banner{position:sticky;top:0;z-index:100;background:#fff2c8;color:#42351c;border-bottom:1px solid #e2cf91;padding:12px 20px;display:flex;gap:12px;justify-content:space-between;align-items:center}.preview-banner p{margin:4px 0;font-size:13px;max-width:880px}.preview-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.preview-actions button,.preview-actions a{font:inherit;font-size:13px;border:1px solid #bca97b;background:#fffdf6;color:#42351c;padding:7px 11px;border-radius:10px;cursor:pointer;text-decoration:none}.preview-help{margin:12px 20px;padding:12px 16px;border:1px solid #deddd5;border-radius:14px;background:#fafbf7;font-size:13px}.preview-help summary{cursor:pointer;font-weight:650}.preview-help p{margin:10px 0}.preview-help small{color:#5b6258}@media(max-width:600px){.preview-banner{position:relative;display:block;padding:12px}.preview-banner .preview-actions{margin-top:8px}.preview-help{margin:10px;padding:12px}}`;
const html = '<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KinnsoOS · 本機示例預覽</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/preview.css"><link rel="stylesheet" href="/preview-shell.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>';
const sessions = new Map();
const publicShares=new Map();
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Kinnso-Preview', 'examples-only-no-real-connections');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
  if (req.headers.host !== `${host}:${port}` || (req.headers.origin && req.headers.origin !== origin)) {res.writeHead(403); res.end('Local preview only'); return;}
  const url = new URL(req.url, origin);
  if (url.pathname === '/__preview/health') {res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({mode: 'EXAMPLES_ONLY', persistent: false, realConnections: false})); return;}
  if(url.pathname==='/__preview/sample-photo'&&req.method==='GET'){res.setHeader('Content-Type','image/png');res.end(SAMPLE_PNG);return;}
  if(url.pathname.startsWith('/api/shared-media/')&&req.method==='GET'){
    const segments=url.pathname.split('/'),share=publicShares.get(segments[3]);
    const projection=share?.readProjection?share.readProjection():share?.projection;
    if(!share||share.state!=='active'||Date.parse(share.expiresAt)<=Date.now()||!projection?.approvedMediaIds.includes(segments[4])){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','image/png');res.end(SAMPLE_PNG);return;
  }
  if(url.pathname.startsWith('/__preview/public/')&&req.method==='GET'){
    const share=publicShares.get(url.pathname.split('/').at(-1));const allowed=share&&share.state==='active'&&Date.parse(share.expiresAt)>Date.now();
    const projection=allowed?(share.readProjection?share.readProjection():share.projection):null;
    res.writeHead(allowed&&projection?200:allowed?403:404,{'Content-Type':'application/json'});res.end(JSON.stringify(allowed&&projection?{ok:true,data:projection}:{ok:false,code:allowed?'RESTRICTED':'NOT_FOUND',retryable:false}));return;
  }
  let sid = /(?:^|;\s*)kinnso_preview=([a-f\d-]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (!sessions.has(sid)) {sid = randomUUID(); sessions.set(sid, createExampleBackend({origin,publicShares})); res.setHeader('Set-Cookie', `kinnso_preview=${sid}; HttpOnly; SameSite=Strict; Path=/`);}
  if (url.pathname === '/__preview/reset' && req.method === 'POST') {sessions.get(sid).dispose();sessions.set(sid, createExampleBackend({origin,publicShares})); res.writeHead(204); res.end(); return;}
  if (url.pathname.startsWith('/api/')||url.pathname.startsWith('/__preview/')) {
    try {
      let raw = ''; for await (const chunk of req) {raw += chunk; if (Buffer.byteLength(raw) > 256000) {res.writeHead(413); res.end(); return;}}
      const backend=sessions.get(sid),body=raw?JSON.parse(raw):undefined;
      if(!url.pathname.startsWith('/__preview/discovery/'))await backend.before(req.method,url.pathname,body);
      const reply = url.pathname.startsWith('/__preview/discovery/')?await backend.discovery.handle(req.method,url.pathname.slice('/__preview/discovery'.length),body):await backend(req.method,url.pathname,body,url.searchParams);
      if(reply.binary){res.writeHead(reply.status,{'Content-Type':'image/png'});res.end(reply.binary);return;}
      res.writeHead(reply.status, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(reply.body));
    } catch {res.writeHead(400, {'Content-Type': 'application/json'}); res.end(JSON.stringify({ok: false, code: 'INVALID', retryable: false}));}
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405); res.end(); return;}
  const asset = assets.get(url.pathname);
  res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : asset ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(url.pathname === '/preview-shell.css' ? previewCss : asset ?? html);
});
server.listen(port, host, () => process.stdout.write(`KinnsoOS EXAMPLES ONLY preview: ${origin}/zh-HK/\nNo database, migrations, deployment, model or real connections. State is memory-only.\n`));
server.on('error', error => {process.stderr.write(error.message + '\n'); process.exitCode = 1;});
