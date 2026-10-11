import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
async function moduleAt(path){const b=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node'});const mod={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;}
const {isKnownRoute}=await moduleAt('../app/travel/routes.ts');
const {entityLink}=await moduleAt('../lib/notifications/repository.ts');
const id='11111111-1111-4111-8111-111111111111';
test('collaboration pages have canonical native routes, including UUID deep links',()=>{
 for(const path of ['studio/missions/'+id,'studio/opportunities','studio/outcomes','studio/earnings','studio/inbox','ops/merchants','merchants/dashboard/profile'])assert.equal(isKnownRoute(path),true,path);
 for(const path of ['studio/missions/'+id+'/edit','studio/missions/not-a-uuid','studio/missions/../../merchant'])assert.equal(isKnownRoute(path),false,path);
});
test('mission and earnings inbox links stay in current language and native app',()=>{
 for(const locale of ['en','zh-HK']){assert.equal(entityLink({entityType:'mission',entityId:id},locale),`/${locale}/studio/missions/${id}`);for(const entityType of ['mission_settlement','payout_batch'])assert.equal(entityLink({entityType,entityId:id},locale),`/${locale}/studio/earnings`);}
 assert.equal(entityLink({entityType:'mission',entityId:'../private'},'en'),null);
});
