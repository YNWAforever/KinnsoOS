import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const helpers=await import('../lib/collaboration/list-query.ts').catch(()=>({}));
const id='11111111-1111-4111-8111-111111111111';
test('collaboration query validates scope-specific states and bounded literal search',()=>{
 assert.equal(typeof helpers.collaborationListQuery,'function');
 assert.deepEqual(helpers.collaborationListQuery(new URLSearchParams('q= city &status=revision_requested&sort=deadline'),'mine'),{q:'city',status:'revision_requested',sort:'deadline'});
 for(const [search,scope] of [['q='+ 'x'.repeat(101),'mine'],['q=a&q=b','merchant'],['status=draft','mine'],['status=active','available'],['sort=amount','merchant'],['actorId='+id,'mine'],['after=','mine'],['after='+id,'merchant']])assert.throws(()=>helpers.collaborationListQuery(new URLSearchParams(search),scope),/INVALID/);
 assert.throws(()=>helpers.collaborationListQuery(new URLSearchParams('after=v0.'+id),'mine'),/INVALID/);
});
test('filter changes clear list and detail cursors without discarding authored input',()=>{
 assert.equal(typeof helpers.changeListFilter,'function');
 const result=helpers.changeListFilter({q:'old',status:'draft',sort:'recent',after:'old',campaignId:id,participantsAfter:id,submissionsAfter:id,branchesAfter:id},{q:'city',status:'published',sort:'deadline'});
 assert.deepEqual(result,{q:'city',status:'published',sort:'deadline'});
});
async function route(path,calls){const require=createRequire(import.meta.url);const out=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'session-boundary',setup(b){b.onResolve({filter:/\/api\/server$/},()=>({path:'api',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:'export const apiContext=async()=>({client:{rpc:globalThis.__queryRpc}});export const failure=(code,status)=>Response.json({ok:false,code},{status});export const reply=body=>Response.json(body,{headers:{"Cache-Control":"private, no-store"}});export const backendFailure=()=>failure("FORBIDDEN",403);export const boundedBody=r=>r.json();'}));}}]});const module={exports:{}};globalThis.__queryRpc=async(name,args)=>{calls.push({name,args});return{data:{items:[]},error:null}};new Function('require','module','exports',out.outputFiles[0].text)(require,module,module.exports);return module.exports;}
test('actual list BFFs send validated filter objects to fresh actor-scoped query RPCs',async()=>{const calls=[];try{
 for(const [path,url,name] of [['../app/api/creator/missions/route.ts','creator/missions?scope=mine&q=City&status=revision_requested&sort=deadline','query_kinnso_creator_missions'],['../app/api/merchant/campaigns/route.ts','merchant/campaigns?id='+id+'&q=City&status=published&sort=recent','query_kinnso_merchant_campaigns']]){
  const api=await route(path,calls);const r=await api.GET(new Request('https://local.test/api/'+url));assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private, no-store/);assert.equal(calls.at(-1).name,name);assert.equal(calls.at(-1).args.p_query.q,'City');
 }
}finally{delete globalThis.__queryRpc}});
test('creator list filters use server queries, clear old cursor and distinguish filtered empty state',async()=>{
 const calls=[];const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{list:async(...args)=>{calls.push(args);return{ok:true,data:{items:[],nextCursor:null}}}}});
 assert.ok(h.field('Search collaborations'));h.field('Search collaborations').props.onChange({target:{value:'City'}});h.render();h.find('button','Search collaborations').props.onClick();await tick();h.render();assert.equal(calls.at(-1)[2].q,'City');assert.equal(calls.at(-1)[2].after,undefined);assert.match(h.text(),/No collaborations match these filters/);
});
test('refresh after URL restoration starts a new read without replaying the old cursor',async()=>{
 const calls=[];const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{list:async(...args)=>{calls.push(args);return{ok:true,data:{items:[],nextCursor:null}}}}},{search:'?scope=mine&q=City&after=v1.YWJj'});
 assert.equal(calls[0][0],'mine');assert.equal(calls[0][1],'v1.YWJj');
 h.find('button','Refresh collaborations').props.onClick();await tick();h.render();assert.equal(calls.at(-1)[1],undefined);assert.equal(calls.at(-1)[2].after,undefined);assert.equal(calls.at(-1)[2].q,'City');
});

test('refresh recovers when an initially restored cursor is invalid',async()=>{
 const calls=[];const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{list:async(...args)=>{calls.push(args);return calls.length===1?{ok:false,code:'INVALID'}:{ok:true,data:{items:[],nextCursor:null}};}}},{search:'?scope=mine&q=City&after=v1.YWJj'});
 h.find('button','Refresh collaborations').props.onClick();await tick();h.render();assert.equal(calls.at(-1)[1],undefined);assert.equal(calls.at(-1)[2].after,undefined);assert.equal(calls.at(-1)[2].q,'City');
});
test('unknown merchant write reconciles fresh detail without a stale list cursor or filter',async()=>{
 const reads=[],writes=[],directory={items:[{id,title:'Campaign',summary:'Owned',status:'draft',missionType:'coupon_affiliate',updatedAt:'2026-01-01T00:00:00.000Z'}],nextCursor:null,summary:{published:0},branches:[],detail:null};let lost=false;
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async(_id,q)=>{reads.push(q);return lost&&q.after?{ok:false,code:'INVALID'}:{ok:true,data:directory};},command:async(...args)=>{writes.push(args);if(!lost){lost=true;return{ok:false,code:'UNAVAILABLE'};}return{ok:true,data:{id}};}}},{search:'?q=Campaign&after=v1.YWJj'});
 h.field('Brief title').props.onChange({target:{value:'New draft'}});h.render();h.elements().find(n=>n.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{submitter:{getAttribute:()=> 'draft'}}});await tick();h.render();assert.match(h.text(),/result is not confirmed/);h.find('button','Retry promotion request').props.onClick();await tick();h.render();assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);assert.equal(reads[2].after,undefined);assert.equal(reads[2].q,undefined);
});


test('a native same-company campaign deep link reads the selected owned detail after client navigation',async()=>{const reads=[],other='22222222-2222-4222-8222-222222222222';const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async(_id,q)=>{reads.push(q);return{ok:true,data:{items:[],nextCursor:null,summary:{},branches:[],role:'owner',detail:null}};}}},{search:'?company='+id+'&campaign='+id});assert.equal(reads[0].campaignId,id);h.navigate('?company='+id+'&campaign='+other);await tick();h.render();assert.equal(reads.at(-1).campaignId,other);});
