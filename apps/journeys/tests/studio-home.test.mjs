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
