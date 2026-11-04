import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {studioModule} from './helpers/studio-load.mjs';
const nav=await studioModule('navigation');
test('common navigation preserves all three audiences and internal role boundary',()=>{
 assert.equal(typeof nav.getStudioNavigation,'function');
 const guest=nav.getStudioNavigation(null),ops=nav.getStudioNavigation({id:'A',roles:['ops']});
 for(const path of ['explore','trips','saved','record','studio','merchant','workspace','credits'])assert.ok(guest.some(x=>x.path===path),path);
 assert.ok(!guest.some(x=>x.path==='ops'));assert.ok(ops.some(x=>x.path==='ops'));
});
test('workroom recognition accepts only exact routes and UUID thread paths',()=>{
 assert.equal(typeof nav.isStudioRoute,'function');
 for(const path of ['workroom','workroom/templates','workroom/documents','workroom/merchant-results','workroom/traveller-results','workroom/reports','settings/connections','workroom/t/11111111-1111-4111-8111-111111111111'])assert.equal(nav.isStudioRoute(path),true,path);
 for(const path of ['workroom/../ops','workroom/t/no','workroom/t/11111111-1111-4111-8111-111111111111/extra','workroom/unknown'])assert.equal(nav.isStudioRoute(path),false,path);
});
test('original route constants remain present after adding workroom routes',async()=>{
 const routes=await readFile(new URL('../app/travel/routes.ts',import.meta.url),'utf8');
 for(const entry of ['studio/guides','studio/adventures','studio/earnings','studio/missions','studio/copilot','ticket-wallet','legal/payment-handling'])assert.ok(routes.includes('"'+entry+'"'));
 assert.match(routes,/isStudioRoute\(path\)/);
});
