import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
const result=await build({entryPoints:[fileURLToPath(new URL('../proxy.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server'],plugins:[{name:'session-refresh',setup(b){
 b.onResolve({filter:/^@supabase\/ssr$/},()=>({path:'session',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function createServerClient(origin,key,{cookies}){return{auth:{getUser:async()=>{cookies.setAll([{name:'session',value:'refreshed',options:{httpOnly:true,secure:true,sameSite:'lax',path:'/'}}]);return{data:{user:{id:'fixture'}}};}}};}`,loader:'js'}));
}}]});
const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports);
test('page alias preserves query and refreshed secure session cookies without caching',async t=>{
 const values={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
 for(const[k,v]of Object.entries(values)){const previous=process.env[k];process.env[k]=v;t.after(()=>{if(previous===undefined)delete process.env[k];else process.env[k]=previous;});}
 const response=await mod.exports.proxy(new NextRequest('https://kinnso-os.vercel.app/zh-hk/creator?tab=guides'));
 assert.equal(response.status,307);assert.equal(response.headers.get('location'),'https://kinnso-os.vercel.app/zh-HK/studio?tab=guides');
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 const cookie=response.cookies.get('session');assert.equal(cookie.value,'refreshed');assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'lax');
 for(const method of ['POST','PUT','PATCH','DELETE']){const response=await mod.exports.proxy(new NextRequest('https://kinnso-os.vercel.app/zh-hk/creator',{method}));assert.equal(response.headers.get('location'),null);}
});
