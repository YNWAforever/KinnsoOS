import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
async function load(){
 const path=new URL('../app/[locale]/auth/sign-out/route.ts',import.meta.url);
 if(!existsSync(path))return{};
 const compiled=await build({entryPoints:[fileURLToPath(path)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server'],plugins:[{name:'legacy-signout',setup(builder){
  builder.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'legacy-signout'}));
  builder.onResolve({filter:/auth\/recovery$/},()=>({path:'recovery',namespace:'legacy-signout'}));
  builder.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'legacy-signout'}));
  builder.onLoad({filter:/.*/,namespace:'legacy-signout'},args=>({contents:args.path==='session'
   ?'export async function serverClient(){return globalThis.__legacySignOutClient}'
   :args.path==='recovery'
    ?"export const RECOVERY_COOKIE='kinnso_recovery'"
    :'export async function cookies(){return globalThis.__legacySignOutCookies}',loader:'js'}));
 }}]});
 const module={exports:{}};
 new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
 return module.exports;
}
const route=await load();
function request(secFetchSite='same-origin'){
 return new Request('https://journeys.example/en/auth/sign-out',{method:'GET',headers:{'sec-fetch-site':secFetchSite}});
}
function setup(t,{client=true}={}){
 const calls=[],deleted=[];
 globalThis.__legacySignOutClient=client?{auth:{signOut:async options=>{calls.push(options);return{error:null}}}}:null;
 globalThis.__legacySignOutCookies={delete:name=>deleted.push(name)};
 t.after(()=>{delete globalThis.__legacySignOutClient;delete globalThis.__legacySignOutCookies;});
 return{calls,deleted};
}
test('legacy sign-out rejects cross-site navigation before clearing the current session',async t=>{
 assert.equal(typeof route.GET,'function');
 const state=setup(t),response=await route.GET(request('cross-site'),{params:Promise.resolve({locale:'en'})});
 assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')).pathname,'/en/sign-in');assert.equal(state.calls.length,0);assert.equal(state.deleted.length,0);
});
test('legacy sign-out clears only the current session and never accepts a destination parameter',async t=>{
 const state=setup(t),response=await route.GET(new Request('https://journeys.example/zh-hk/auth/sign-out?next=https://evil.test',{headers:{'sec-fetch-site':'same-origin'}}),{params:Promise.resolve({locale:'zh-hk'})});
 assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')).pathname,'/zh-HK/sign-in');assert.deepEqual(state.calls,[{scope:'local'}]);assert.deepEqual(state.deleted,['kinnso_recovery']);
});
test('legacy sign-out falls back to the supported default locale and reports unavailable configuration safely',async t=>{
 let state=setup(t,{client:false}),response=await route.GET(request('none'),{params:Promise.resolve({locale:'ja'})});
 assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')).pathname,'/en/sign-in');assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),'unavailable');assert.equal(state.deleted.length,0);
});
