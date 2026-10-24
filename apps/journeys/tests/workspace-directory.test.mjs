import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const compiled=await build({entryPoints:['app/integration/WorkspacePanel.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime','next/link'],plugins:[{name:'context-boundary',setup(b){
 b.onResolve({filter:/\/travel\/ui$/},()=>({path:'ui',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useApp=()=>({locale:globalThis.locale,t:(en,zh)=>globalThis.locale==='en'?en:zh,href:path=>'/'+globalThis.locale+'/'+path});`}));
}}]});
function directory(locale,features,mode='connected'){
 const module={exports:{}};runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,locale,require:name=>name==='next/link'?'a':require(name)});
 return renderToStaticMarkup(createElement(module.exports.WorkspacePanel,{features,mode}));
}
for(const locale of ['en','zh-HK']){
 test(`directory ${locale}: native workspaces and explicit demos cannot be confused`,()=>{
  const html=directory(locale,{creator:true,merchant:true,ops:true,catalog:true,trips:true});
  for(const path of ['studio','merchant','ops'])assert.match(html,new RegExp(`href="/${locale}/${path}"`));
  for(const path of ['studio','merchants/dashboard','demo-lab'])assert.match(html,new RegExp(`href="/${locale}/demo/${path}"`));
  assert.match(html,/https:\/\/remix-kinnso-web.vercel.app\//);
  assert.doesNotMatch(html,/Preview new demo layout|預覽新版示範版面/);
 });
 test(`directory ${locale}: catalog connectivity does not imply trip or role readiness`,()=>{
  const html=directory(locale,{catalog:true,trips:false,creator:false,merchant:false,ops:false},'unavailable');
  assert.match(html,locale==='en'?/Published guides: connected/:/已發布攻略：已接通/);
  assert.match(html,locale==='en'?/Account trip sync: not connected yet/:/帳戶行程同步：尚未接通/);
  assert.equal((html.match(locale==='en'?/Service not connected yet/g:/服務尚未接通/g)||[]).length,3);
  assert.match(html,new RegExp(`href="/${locale}/explore"`));
 });
 test(`directory ${locale}: demo context never claims enabled account services`,()=>{
  const html=directory(locale,{catalog:true,trips:true,creator:true,merchant:true,ops:true},'demo');
  assert.match(html,locale==='en'?/Demo workspace directory/:/示範工作區導覽/);
  assert.doesNotMatch(html,/Published guides: connected|已發布攻略：已接通/);
 });
}
