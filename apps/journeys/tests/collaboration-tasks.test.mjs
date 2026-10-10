import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const path=new URL('../lib/collaboration/tasks.ts',import.meta.url);
const tasks=existsSync(path)?await import(path):{};
const id='11111111-1111-4111-8111-111111111111',milestoneId='22222222-2222-4222-8222-222222222222';
const mission={id,title:'Authored local route',status:'published',participant:{status:'active'},milestones:[{id:milestoneId,title:'Authored draft',dueAt:'2026-10-12T08:00:00Z'}],submissions:[{milestoneId,status:'revision_requested',proofUrls:['https://private.example/secret-proof'],notes:'private notes'}]};
function requireTasks(){assert.equal(typeof tasks.creatorTasks,'function');assert.equal(typeof tasks.campaignTasks,'function');assert.equal(typeof tasks.merchantSetupTasks,'function');}

test('creator tasks distinguish invitations, revision work, waiting and completed; links have real identity',()=>{
 requireTasks();
 const items=[mission,{...mission,id:milestoneId,participant:{status:'invited'}},{...mission,id:'33333333-3333-4333-8333-333333333333',participant:{status:'applied'}},{...mission,id:'44444444-4444-4444-8444-444444444444',participant:{status:'completed'}}];
 const actions=tasks.creatorTasks(items,'zh-HK');
 assert.deepEqual(new Set(actions.map(a=>a.kind)),new Set(['revise','respond-invite','await-review','completed']));
 const revision=actions.find(a=>a.kind==='revise');assert.equal(revision.dueAt,'2026-10-12T08:00:00Z');assert.equal(revision.href,'/zh-HK/studio/missions/'+id);
 assert.doesNotMatch(JSON.stringify(actions),/secret-proof|private notes/);
 assert.equal(tasks.creatorTasks([],'en').length,0);
 assert.equal(tasks.creatorTasks([{...mission,id:'//foreign.example'}],'en').length,0);
});

test('an active summary continues work without inventing a deadline or completed financial result',()=>{
 requireTasks();const action=tasks.creatorTasks([{id,title:'Existing work',participant:{status:'active'}}],'en')[0];
 assert.equal(action.kind,'continue');assert.equal(action.dueAt,null);assert.equal(action.href,'/en/studio/missions/'+id);
 assert.doesNotMatch(JSON.stringify(action),/paid|settled|income/i);
});

test('owner task actions include own campaign review; marketing never gets private evidence review',()=>{
 requireTasks();const directory={merchantId:id,role:'owner',items:[{id:milestoneId,title:'Own draft',status:'draft'}],detail:{id,title:'Own campaign',participants:[{id:milestoneId,status:'applied'}],submissions:[{id:milestoneId,status:'submitted',proofUrls:['private-proof']}],canReviewSubmissions:true}};
 const owner=tasks.campaignTasks(directory,'en');assert.ok(owner.some(a=>a.kind==='review-application'));assert.ok(owner.some(a=>a.kind==='review-delivery'));
 assert.ok(owner.every(a=>a.href.startsWith('/en/merchant?company='+id+'&campaign=')));
 const marketing=tasks.campaignTasks({...directory,role:'marketing'},'en');assert.equal(marketing.some(a=>a.kind==='review-delivery'),false);
 assert.deepEqual(tasks.campaignTasks({...directory,role:'clerk'},'en'),[]);assert.deepEqual(tasks.campaignTasks({...directory,role:'finance'},'en'),[]);
 assert.doesNotMatch(JSON.stringify(owner),/private-proof/);
});

test('new and pending merchant accounts have setup or waiting actions without claiming company authority',()=>{
 requireTasks();const fresh=tasks.merchantSetupTasks({applications:[],merchant:null},'en');assert.equal(fresh[0].kind,'setup-merchant');
 const pending=tasks.merchantSetupTasks({applications:[{id,status:'pending',companyName:'Own applicant',contactEmail:'private-contact'}],merchant:null},'zh-HK');
 assert.equal(pending[0].kind,'await-merchant-review');assert.equal(pending[0].href,'/zh-HK/merchant#merchant-onboarding');assert.doesNotMatch(JSON.stringify(pending),/private-contact/);
 const rejected=tasks.merchantSetupTasks({applications:[{id,status:'rejected',companyName:'Own applicant'}],merchant:null},'en');assert.equal(rejected[0].kind,'revise-merchant-application');
});

test('creator overview uses bounded role-readable list data and clears it after account invalidation',async()=>{
 assert.ok(existsSync(new URL('../app/travel/CreatorCollaborationTasks.tsx',import.meta.url)),'real overview implementation required');
 let reads=0;const h=await workspaceHarness('CreatorCollaborationTasks',{creatorMissions:{list:async()=>{reads++;return{ok:true,data:{items:[{id,title:'Private actor task',participant:{status:'active'}}],nextCursor:'has-more'}};}}});
 assert.equal(reads,1);assert.match(h.text(),/Private actor task/);assert.match(h.text(),/loaded records/i);
 h.invalidate();await tick();h.render();assert.doesNotMatch(h.text(),/Private actor task/);assert.ok(h.find('a','Sign in to continue'));
});

test('creator overview 503 does not claim empty work and role loss propagates to its enclosing workspace',async()=>{
 assert.ok(existsSync(new URL('../app/travel/CreatorCollaborationTasks.tsx',import.meta.url)),'real overview implementation required');
 for(const code of ['UNAVAILABLE','AUTH_REQUIRED','FORBIDDEN']){
  const denied=[];const h=await workspaceHarness('CreatorCollaborationTasks',{creatorMissions:{list:async()=>({ok:false,code,retryable:code==='UNAVAILABLE'})}},{onDenied:c=>denied.push(c)});
  assert.ok(h.elements().some(n=>n.props.role==='alert'));assert.doesNotMatch(h.text(),/No tasks on this page/);
  assert.deepEqual(denied,code==='UNAVAILABLE'?[]:[code]);
 }
});

test('the real creator studio places next actions ahead of existing guides and clears both private areas on logout',async()=>{
 const h=await workspaceHarness('CreatorWorkspace',{request:async(url)=>url==='/api/creator/profile'?{ok:true,data:{step:'done',profileReady:true}}:{ok:true,data:{items:[{id,payload:{title:'Private authored guide',city:'Local'},status:'draft',revision:1}],nextCursor:null}},creatorMissions:{list:async()=>({ok:true,data:{items:[{id,title:'Private actor task',participant:{status:'active'}}],nextCursor:null}})}},{path:'studio'});
 await tick();h.render();assert.match(h.text(),/Your next actions/);assert.match(h.text(),/Private actor task/);assert.match(h.text(),/Your authored guides/);
 assert.ok(h.text().indexOf('Your next actions')<h.text().indexOf('Your authored guides'));
 h.invalidate();h.render();assert.doesNotMatch(h.text(),/Private actor task|Private authored guide/);
});

test('merchant next-action entry reads its requested campaign and exposes its real deep link',async()=>{
 const queries=[];const directory={merchantId:id,role:'owner',items:[{id:milestoneId,title:'Own draft',status:'draft'}],detail:null,summary:{draft:1,published:0,applications:0,activeCreators:0,submitted:0,approved:0},branches:[],nextCursor:null};
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async(merchantId,query)=>{queries.push(query);return{ok:true,data:directory};}}},{search:'?company='+id+'&campaign='+milestoneId});
 await tick();h.render();assert.deepEqual(JSON.parse(JSON.stringify(queries[0])),{campaignId:milestoneId});
 assert.match(h.text(),/Your next actions/);assert.ok(h.elements().some(n=>n.type==='a'&&n.props.href==='/en/merchant?company='+id+'&campaign='+milestoneId+'#merchant-campaigns'));
});

test('company task entry selects only an existing owned membership, with a safe fallback for foreign IDs',async()=>{
 const memberships=[{merchantId:id,name:'First company',role:'clerk',branchIds:[]},{merchantId:milestoneId,name:'Second company',role:'clerk',branchIds:[]}];
 for(const [requested,expected] of [[milestoneId,milestoneId],['33333333-3333-4333-8333-333333333333',id]]){
  const reads=[];const h=await workspaceHarness('MerchantWorkspace',{request:async(url)=>{
   reads.push(url);return url==='/api/merchant'?{ok:true,data:memberships}:{ok:true,data:{merchantId:expected,role:'clerk',missions:[],applications:[],outcomes:[],branches:[],moneyCapability:'historical_records_only'}};
  }},{search:'?company='+requested});
  await tick();h.render();assert.equal(h.find('select','Company').props.value,expected);
  assert.ok(reads.includes('/api/merchant?id='+expected));assert.equal(h.text().includes('Complete campaign draft'),false);
 }
});

test('a late prior-account task read stays private and a new actor can load its own overview',async()=>{
 let resolveOld,reads=0;
 const h=await workspaceHarness('CreatorCollaborationTasks',{creatorMissions:{list:async()=>++reads===1?await new Promise(resolve=>{resolveOld=resolve;}):{ok:true,data:{items:[{id,title:'New actor work',participant:{status:'active'}}],nextCursor:null}}}});
 h.invalidate();resolveOld({ok:true,data:{items:[{id,title:'Prior actor private work',participant:{status:'active'}}],nextCursor:null}});await tick();h.render();assert.doesNotMatch(h.text(),/Prior actor private work/);
 h.props.actorId='actor-B';h.render();await tick();h.render();assert.match(h.text(),/New actor work/);assert.equal(reads,2);
});
