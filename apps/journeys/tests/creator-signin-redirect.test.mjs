import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url);
async function load(entry, actor=null, signInError=null){
 const compiled=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'session-boundary',setup(b){
  b.onResolve({filter:/\/supabase\/server$/},()=>({path:'session',namespace:'fixture'}));
  b.onLoad({filter:/^session$/,namespace:'fixture'},()=>({contents:'export async function serverClient(){return globalThis.client}'}));
  b.onResolve({filter:/\/travel\/Workbench$/},()=>({path:'workbench',namespace:'fixture'}));
  b.onLoad({filter:/workbench/,namespace:'fixture'},()=>({contents:'export const Workbench=()=>null;'}));
 }}]});
 const module={exports:{}};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,URL,URLSearchParams,AbortSignal,structuredClone,crypto,process:{env:{}},client:{auth:{
  getUser:async()=>({data:{user:actor?{id:actor.id}:null},error:null}),
  signInWithPassword:async()=>({error:signInError}),
 },rpc:async()=>({data:actor,error:null})},require:name=>{
  if(name==='next/navigation')return{redirect:destination=>{throw Object.assign(new Error('redirect'),{destination});},notFound:()=>{throw Error('not_found');}};
  if(name==='next/headers')return{cookies:async()=>({delete(){}})};
  return require(name);
 }});
 return module.exports;
}
const entry='app/[locale]/[[...route]]/page.tsx';
const anonymous=await load(entry),actor={id:'11111111-1111-4111-8111-111111111111',roles:['creator'],merchantMemberships:[]};
const authenticated=await load(entry,actor);
for(const locale of ['en','zh-HK']){
 for(const path of ['studio','studio/guides/new','studio/missions/22222222-2222-4222-8222-222222222222','studio/offers','studio/receipts','merchant','merchants/dashboard/profile','ops','ops/reports','admin']){
  test(`anonymous ${locale}/${path} goes to local sign-in with its full task`,async()=>{
   await assert.rejects(anonymous.default({params:Promise.resolve({locale,route:path.split('/')}),searchParams:Promise.resolve({tab:'drafts',filter:['new','active']})}),error=>{
    const url=new URL(error.destination,'https://kinnso-os.vercel.app');
    assert.equal(url.origin,'https://kinnso-os.vercel.app');
    assert.equal(url.pathname,`/${locale}/sign-in`);
    assert.equal(url.searchParams.get('next'),`/${locale}/${path}?tab=drafts&filter=new&filter=active`);
    return true;
   });
  });
 }
 test(`signed-in creator ${locale} enters the KinnsoOS studio`,async()=>{
  const page=await authenticated.default({params:Promise.resolve({locale,route:['studio']})});
  assert.equal(page.props.children.props.path,'studio');
  assert.equal(page.props.children.props.actor.id,actor.id);
 });
 test(`public and demo ${locale} entries remain accessible anonymously`,async()=>{
  for(const route of [['workspace'],['for-creators'],['demo','studio'],['demo','merchants','dashboard']]){
   assert.ok(await anonymous.default({params:Promise.resolve({locale,route})}));
  }
 });
}

const actions=await load('app/[locale]/sign-in/actions.ts');
for(const locale of ['en','zh-HK','zh-hk'])test(`password sign-in returns to the local creator task (${locale})`,async()=>{
 const form=new FormData();
 for(const [key,value] of Object.entries({locale,next:`/${locale}/studio?tab=drafts`,email:'creator@example.test',password:'synthetic'}))form.set(key,value);
 await assert.rejects(actions.signIn(form),error=>{
  assert.equal(error.destination,`/${locale==='en'?'en':'zh-HK'}/studio?tab=drafts`);return true;
 });
 form.set('next','https://remix-kinnso-web.vercel.app/en/studio');
 await assert.rejects(actions.signIn(form),error=>{assert.equal(error.destination,`/${locale==='en'?'en':'zh-HK'}/trips`);return true;});
});

test('failed sign-in keeps the creator destination on the retry form',async()=>{
 const failed=await load('app/[locale]/sign-in/actions.ts',null,{message:'invalid credentials'});
 const form=new FormData();
 for(const [key,value] of Object.entries({locale:'zh-HK',next:'/zh-HK/studio?tab=drafts',email:'creator@example.test',password:'synthetic'}))form.set(key,value);
 await assert.rejects(failed.signIn(form),error=>{
  const url=new URL(error.destination,'https://kinnso-os.vercel.app');
  assert.equal(url.pathname,'/zh-HK/sign-in');assert.equal(url.searchParams.get('next'),'/zh-HK/studio?tab=drafts');assert.equal(url.searchParams.get('error'),'failed');return true;
 });
});
