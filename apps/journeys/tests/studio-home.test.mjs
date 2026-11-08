import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const t=await studioModule('templates');
test('five templates per role carry documents, permission, output, destination and estimate',()=>{
 assert.ok(Array.isArray(t.templates));assert.equal(t.templates.length,20);
 for(const role of ['traveller','creator','merchant','ops'])assert.equal(t.templates.filter(x=>x.role===role).length,5);
 for(const x of t.templates)for(const key of ['inputs','permission','output','destination','difficulty','minutes'])assert.ok(x[key],x.id+':'+key);
});
test('intent routing suggests but never grants a role; ambiguous intent asks one question',()=>{
 assert.equal(typeof t.suggestTemplates,'function');
 assert.equal(t.suggestTemplates('寫 guide').ids[0],'C1');
 assert.equal(t.suggestTemplates('規劃行程').ids[0],'T1');
 assert.equal(t.suggestTemplates('更新商戶資料').ids[0],'M1');
 assert.equal(t.suggestTemplates('寫攻略及更新店舖').needsClarification,true);
 assert.ok(!('roles' in t.suggestTemplates('我要成為 ops')));
});

for(const [question,id] of [
 ['Adopt a saved guide','T2'],['把收藏攻略變成我的行程','T2'],
 ['Share my trip','T3'],['撤回行程分享','T3'],
 ['Organize my bookmarks','T4'],['整理我的收藏','T4'],
 ['Record a travel moment','T5'],['記錄旅途片刻','T5'],
 ['Check my guide before publishing','C2'],['發佈前檢查攻略','C2'],
 ['Review my earnings','C3'],['成效檢討','C3'],
 ['Respond to revisions','C4'],['回應修訂與交付','C4'],
 ['Update my guide','C5'],['更新攻略版本','C5'],
 ['Handle customer enquiries','M2'],['處理查詢','M2'],
 ['Prepare campaign material','M3'],['製作活動素材','M3'],
 ['Check a collaboration brief','M4'],['檢查合作 brief','M4'],
 ['Review campaign results','M5'],['檢討活動成果','M5'],
])test(`homepage intent selects ${id}: ${question}`,()=>{
 assert.deepEqual(t.suggestTemplates(question),{ids:[id],needsClarification:false});
});
test('specific tasks from different audiences still ask the user to choose',()=>{
 assert.deepEqual(t.suggestTemplates('Share my trip and update my guide'),{ids:['T3','C5'],needsClarification:true});
});
test('turning original notes into a guide creates a brief rather than adopting a guide',()=>{
 assert.deepEqual(t.suggestTemplates('Help me turn my own notes into a guide brief…'),{ids:['C1'],needsClarification:false});
});
test('task nouns do not override the requested action',()=>{
 assert.deepEqual(t.suggestTemplates('Update my travel guide'),{ids:['C5'],needsClarification:false});
 assert.deepEqual(t.suggestTemplates('Review campaign performance'),{ids:['M5'],needsClarification:false});
 assert.deepEqual(t.suggestTemplates('檢討活動成效'),{ids:['M5'],needsClarification:false});
});
test('every task can continue to a route accepted by the real application',async()=>{
 const {isKnownRoute}=await studioModule('../../app/travel/routes');
 for(const task of t.templates)assert.equal(isKnownRoute(task.destination),true,task.id+': '+task.destination);
});
