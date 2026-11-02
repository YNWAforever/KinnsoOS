import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const require=createRequire(import.meta.url);
async function render(name,props={}){
 const path=new URL('../app/workroom/'+name+'.tsx',import.meta.url);assert.ok(existsSync(path),name+' exists');
 const result=await build({entryPoints:[path.pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,loader:{'.css':'empty'},platform:'node',format:'cjs',external:['react','react/jsx-runtime','next/link','next/navigation'],plugins:[{name:'context',setup(b){b.onResolve({filter:/travel\/ui$/},()=>({path:'ui',namespace:'studio-test'}));b.onLoad({filter:/.*/,namespace:'studio-test'},()=>({contents:"export const useApp=()=>({t:(en,zh)=>zh,href:p=>'/zh-HK/'+p,locale:'zh-HK'});"}));}}]});
 const module={exports:{}};runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,URLSearchParams,crypto,require:name=>name==='next/link'?'a':name==='next/navigation'?{useRouter:()=>({push(){}}),useSearchParams:()=>new URLSearchParams()}:require(name)});
 return renderToStaticMarkup(createElement(module.exports[name],props));
}
test('one shared home exposes three equal audience groups and retains exploration positioning',async()=>{
 const html=await render('ConversationHome');
 for(const text of ['探索、規劃及記錄旅程','下一段旅程，從一個問題開始。','旅人','創作者','商戶','選擇文件','任務範本','開始聊聊'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/data-audience=/g)||[]).length,3);assert.ok(!html.includes('data-audience="ops"'));
});
test('unconnected skills never invent metrics or restrict manual basic work',async()=>{
 const html=await render('ConnectionsPage');
 for(const text of ['未連接','未同步','WhatsApp Business','Instagram','手動文件'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('已授權全部'));assert.ok(!html.includes('同步：0'));
});
