import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';


const require=createRequire(import.meta.url);
const routeBuild=await build({entryPoints:['app/travel/routes.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const routeModule={exports:{}};runInNewContext(routeBuild.outputFiles[0].text,{module:routeModule,exports:routeModule.exports,require,structuredClone,crypto});
const {isKnownRoute}=routeModule.exports;
const compiled=await build({entryPoints:['app/integration/PublicInformation.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime','next/link'],plugins:[{name:'context',setup(b){
 b.onResolve({filter:/\/travel\/ui$/},()=>({path:'ui',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useApp=()=>({locale:globalThis.locale,t:(en,zh)=>globalThis.locale==='en'?en:zh,href:path=>'/'+globalThis.locale+'/'+path});`}));
}}]});
function render(path,locale,enabled=false){
 const module={exports:{}};runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,locale,require:name=>name==='next/link'?'a':require(name)});
 return renderToStaticMarkup(createElement(module.exports.PublicInformation,{path,creatorEnabled:enabled,merchantEnabled:enabled,supportEnabled:enabled}));
}
for(const [locale,headings] of [['en',['About Kinnso Journeys','Create with Kinnso','Creator quality standards','Business pricing','Booking terms']],['zh-HK',['關於 Kinnso Journeys','與 Kinnso 一起創作','創作者內容準則','商戶收費資訊','訂位條款']]]){
 test(`retained ${locale}: distinct page intent replaces generic help`,()=>{
  for(const [i,path] of ['about','for-creators','for-creators/quality-standards','for-business/pricing','legal/booking-terms'].entries()){
   assert.ok(render(path,locale).includes(`<h1>${headings[i]}</h1>`),`${path} must have its own heading`);
  }
 });
 test(`retained ${locale}: unknown paths cannot render a policy or help`,()=>{
  assert.equal(render('legal/not-a-policy',locale),'');
 });
}
async function registry(){
 assert.ok(existsSync(new URL('../app/integration/public-entry-registry.ts',import.meta.url)),'typed public-entry registry must exist');
 return import('../app/integration/public-entry-registry.ts');
}
test('every retained static public entry is explicitly known; native and unknown paths remain outside registry',async()=>{
 const {PUBLIC_ENTRY_PATHS,resolvePublicEntry}=await registry();
 assert.equal(new Set(PUBLIC_ENTRY_PATHS).size,PUBLIC_ENTRY_PATHS.length);
 for(const path of PUBLIC_ENTRY_PATHS){
  assert.equal(isKnownRoute(path),true,path);
  for(const locale of ['en','zh-HK']){
   const entry=resolvePublicEntry(path,locale,{creator:false,merchant:false,support:false});
   assert.ok(entry?.title&&entry.bodyKey&&entry.primary.label,path);
   assert.ok(entry.primary.href.startsWith(`/${locale}/`),path);
   assert.equal(isKnownRoute(entry.primary.href.slice(locale.length+2).replace(/^demo\//,'')),true,path);
  }
 }
 for(const path of ['legal/not-a-policy','legal/privacy/extra','for-business/unknown','g/anything','studio','merchant','ops','trips','explore','workspace'])assert.equal(resolvePublicEntry(path,'en',{creator:true,merchant:true,support:true}),null,path);
});
test('disabled capability offers a useful public exit; enabled service still requires account/company authorization',async()=>{
 const {resolvePublicEntry}=await registry();
 for(const [path,service,target] of [['for-creators/apply','creator','studio'],['for-business/post-a-mission','merchant','merchant'],['contact','support','support']]){
  for(const locale of ['en','zh-HK']){
   const disabled=resolvePublicEntry(path,locale,{creator:false,merchant:false,support:false});
   assert.equal(disabled.primary.href,`/${locale}/explore`);
   assert.equal(disabled.kind,'unavailable');
   const enabled=resolvePublicEntry(path,locale,{creator:false,merchant:false,support:false,[service]:true});
   assert.equal(enabled.primary.href,`/${locale}/${target}`);
   assert.match(enabled.notice,locale==='en'?/account/:/帳戶/);
   assert.doesNotMatch(enabled.primary.href,/demo/);
  }
 }
});
test('unavailable commerce, pricing and terms never produce transaction actions',async()=>{
 const {resolvePublicEntry}=await registry();
 for(const path of ['bookings','tickets','gift-cards','for-business/pricing','legal/payment-handling','legal/refund-policy','legal/merchant-terms']){
  const entry=resolvePublicEntry(path,'en',{creator:true,merchant:true,support:true});
  assert.equal(entry.kind,'unavailable');
  assert.equal(entry.primary.href,'/en/explore');
  assert.doesNotMatch(JSON.stringify(entry),/Buy now|Pay now|Guaranteed refund|Automatic payout/);
 }
});
