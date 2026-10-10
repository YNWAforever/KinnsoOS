import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,admin,anonymous} from './local-fixtures.mjs';
const ok=async promise=>{const result=await promise;assert.equal(result.error,null,JSON.stringify(result.error));return result.data;};
async function setup(){
 const f=await fixture(),owner=await f.actor(),marketing=await f.actor(),outsider=await f.actor(),creator=await f.actor(true);
 const merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic campaign company',contact_email:'synthetic@example.test'}).select('id').single())).id;
 const legacy=(command,actor=owner)=>actor.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:merchantId,p_request_id:randomUUID(),p_command:command});
 await ok(legacy({type:'setMember',userId:marketing.id,role:'marketing',branchIds:[],active:true}));
 const command=(command,actor=owner,requestId=randomUUID())=>actor.client.rpc('apply_kinnso_merchant_campaign_command',{p_merchant_id:merchantId,p_request_id:requestId,p_command:command});
 const read=(campaignId=null,actor=owner,extra={})=>actor.client.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:merchantId,p_campaign_id:campaignId,...extra});
 const input={title:'Synthetic city campaign',summary:'Publish an original guide with source-backed city advice.',couponCode:'CITY',couponUrl:'https://example.test/city',affiliateRate:70,kinnsoRate:30,creatorRate:70,requirements:['Original photographs'],deliverables:['One public guide'],milestones:[{id:randomUUID(),title:'Published city guide',description:'Submit the guide URL and supporting notes.',dueAt:null}]};
 return{f,owner,marketing,outsider,creator,merchantId,legacy,command,read,input,cleanup:async()=>{await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));await f.cleanup();}};
}

test('campaign drafts publish atomically, freeze terms, close applications and enforce current authority and stale snapshots',async()=>{
 const x=await setup();try{
  const id=randomUUID(),draft={type:'createDraft',id,input:{...x.input,couponCode:'',couponUrl:'',affiliateRate:null,milestones:[]},publish:false,reason:'Save incomplete authored work'};
  const created=await ok(x.command(draft));assert.equal(created.status,'draft');
  assert.equal((await x.command({...draft,id:randomUUID(),publish:true})).error?.message,'invalid_brief');
  assert.equal((await x.command({...draft,id:randomUUID(),input:{...x.input,paidFee:99}})).error?.message,'invalid_command');
  assert.equal((await x.read(id,x.outsider)).error?.message,'forbidden');assert.ok((await anonymous.rpc('get_kinnso_merchant_campaigns',{p_merchant_id:x.merchantId})).error);
  const fresh=await ok(x.read(id));assert.equal(fresh.detail.canEdit,true);
  assert.equal(fresh.items[0].summary,x.input.summary);assert.equal(fresh.detail.summary,x.input.summary);
  assert.deepEqual(fresh.summary,{draft:1,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0});
  const update={type:'updateDraft',id,expectedUpdatedAt:fresh.detail.updatedAt,input:x.input,reason:'Complete the draft'};
  const changed=await ok(x.command(update,x.marketing));assert.notEqual(changed.updatedAt,fresh.detail.updatedAt);
  assert.equal((await x.command(update)).error?.message,'revision_conflict');
  const requestId=randomUUID(),publish={type:'publish',id,expectedUpdatedAt:changed.updatedAt,reason:'Confirmed authored brief'};
  const results=await Promise.all([x.command(publish,x.marketing,requestId),x.command(publish,x.marketing,requestId)]);const receipt=await ok(Promise.resolve(results[0]));assert.deepEqual(await ok(Promise.resolve(results[1])),receipt);
  const published=await ok(x.read(id));assert.equal(published.detail.status,'published');assert.equal(published.detail.canEdit,false);assert.deepEqual(published.detail.requirements,['Original photographs']);assert.equal(published.detail.milestones.length,1);
  assert.equal((await x.command({...update,expectedUpdatedAt:receipt.updatedAt})).error?.message,'revision_conflict');
  const money=await ok(admin.from('missions').select('paid_fee_amount,paid_fee_currency,mission_type,kinnso_requires_application').eq('id',id).single());assert.equal(money.mission_type,'coupon_affiliate');assert.equal(money.paid_fee_amount,null);assert.equal(money.paid_fee_currency,null);assert.equal(money.kinnso_requires_application,true);
  const closed=await ok(x.command({type:'close',id,expectedUpdatedAt:receipt.updatedAt,reason:'No new applications'}));assert.equal(closed.status,'paused');
  await ok(x.legacy({type:'setMember',userId:x.marketing.id,role:'marketing',branchIds:[],active:false}));assert.equal((await x.command(publish,x.marketing,requestId)).error?.message,'forbidden');
 }finally{await x.cleanup();}
});

test('owner deliverable reviews retain feedback, audit once and create no financial obligation for coupon work',async()=>{
 const x=await setup();try{
  const id=randomUUID();await ok(x.command({type:'createDraft',id,input:x.input,publish:true,reason:'Publish original brief'}));
  const participant=await ok(admin.from('mission_participants').insert({mission_id:id,creator_id:x.creator.id,status:'applied',source:'application',application_note:'I can write the guide.'}).select('id,updated_at').single());
  const approve={type:'reviewApplication',id:participant.id,expectedUpdatedAt:participant.updated_at,action:'approve',note:'Your proposal matches the brief.',reason:'Proposal reviewed'};
  await ok(x.command(approve,x.marketing));assert.equal((await x.command(approve)).error?.message,'revision_conflict');
  let read=await ok(x.read(id));assert.equal(read.detail.participants[0].creatorName,'Synthetic contract author');assert.equal(read.detail.participants[0].reviewNote,'Your proposal matches the brief.');
  const submission=await ok(x.creator.client.from('mission_milestone_submissions').insert({mission_milestone_id:x.input.milestones[0].id,mission_participant_id:participant.id,status:'submitted',proof_urls:['https://example.test/guide'],notes:'Original guide proof',submitted_at:new Date().toISOString()}).select('id,updated_at').single());
  const marketer=await ok(x.read(id,x.marketing));assert.deepEqual(marketer.detail.submissions,[]);assert.equal(marketer.detail.canReviewSubmissions,false);assert.equal(marketer.summary.submitted,1);
  const revision={type:'reviewSubmission',id:submission.id,expectedUpdatedAt:submission.updated_at,action:'request_revision',feedback:'Add a source for the transport advice.',reason:'Source missing'};
  assert.equal((await x.command(revision,x.marketing)).error?.message,'forbidden');
  const requestId=randomUUID();const receipt=await ok(x.command(revision,x.owner,requestId));assert.deepEqual(await ok(x.command(revision,x.owner,requestId)),receipt);
  let events=await ok(admin.from('mission_review_events').select('action,reason_category,reason_text').eq('submission_id',submission.id));assert.equal(events.length,1);assert.equal(events[0].reason_category,'other');
  const resubmitted=await ok(x.creator.client.from('mission_milestone_submissions').update({status:'submitted',notes:'Transport source included',submitted_at:new Date().toISOString()}).eq('id',submission.id).select('updated_at').single());
  await ok(x.command({type:'reviewSubmission',id:submission.id,expectedUpdatedAt:resubmitted.updated_at,action:'approve',feedback:'The guide now includes the requested source.',reason:'Source verified'}));
  read=await ok(x.read(id));assert.equal(read.summary.approved,1);assert.equal(read.summary.submitted,0);assert.equal(read.detail.submissions[0].status,'approved');assert.equal(read.detail.submissions[0].feedback,'The guide now includes the requested source.');
  assert.equal((await ok(admin.from('mission_settlements').select('id').eq('mission_id',id))).length,0);
  events=await ok(admin.from('mission_review_events').select('id').eq('submission_id',submission.id));assert.equal(events.length,2);
  const self=await ok(admin.from('mission_participants').insert({mission_id:id,creator_id:x.owner.id,status:'applied',source:'application'}).select('id,updated_at').single());
  assert.equal((await x.command({...approve,id:self.id,expectedUpdatedAt:self.updated_at})).error?.message,'forbidden');
 }finally{await x.cleanup();}
});

test('branch archive retains assignments, prevents stale edits and restores only by an explicit owner command',async()=>{
 const x=await setup();try{
  const id=randomUUID();await ok(x.legacy({type:'createBranch',id,name:'Central'}));
  await ok(x.legacy({type:'setMember',userId:x.outsider.id,role:'clerk',branchIds:[id],active:true}));
  const archive={type:'setBranch',id,expectedActive:true,expectedName:'Central',name:'Central shop',active:false,reason:'Temporarily closed'};
  assert.equal((await x.command(archive,x.marketing)).error?.message,'forbidden');await ok(x.command(archive));assert.equal((await x.command(archive)).error?.message,'revision_conflict');
  assert.deepEqual((await ok(x.read())).branches,[{id,name:'Central shop',active:false}]);
  const clerk=await ok(x.outsider.client.rpc('get_kinnso_merchant_workspace',{p_merchant_id:x.merchantId}));assert.deepEqual(clerk.branches,[]);
  const team=await ok(x.owner.client.rpc('get_kinnso_merchant_team',{p_merchant_id:x.merchantId}));assert.deepEqual(team.members.find(member=>member.userId===x.outsider.id).branchIds,[id]);
  await ok(x.command({...archive,expectedActive:false,expectedName:'Central shop',active:true,reason:'Shop reopened'}));
  assert.equal((await ok(x.outsider.client.rpc('get_kinnso_merchant_workspace',{p_merchant_id:x.merchantId}))).branches[0].name,'Central shop');
 }finally{await x.cleanup();}
});

test('campaign totals cover all keyset pages and foreign cursor IDs never change company scope',async()=>{
 const x=await setup();try{
  const rows=Array.from({length:23},(_,index)=>({id:randomUUID(),merchant_profile_id:x.merchantId,title:'Synthetic page '+index,summary:'Scoped pagination fixture',mission_type:'coupon_affiliate'}));await ok(admin.from('missions').insert(rows));
  const first=await ok(x.read());assert.equal(first.items.length,20);assert.equal(first.summary.draft,23);assert.ok(first.nextCursor);
  const second=await ok(x.read(null,x.owner,{p_after:first.nextCursor}));assert.equal(second.items.length,3);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,23);
  assert.equal((await x.read(null,x.owner,{p_after:randomUUID()})).error?.message,'invalid_cursor');
  assert.equal((await x.read(rows[0].id,x.owner,{p_participant_after:randomUUID()})).error?.message,'invalid_cursor');
  const branches=Array.from({length:53},()=>randomUUID());for(const id of branches)await ok(x.legacy({type:'createBranch',id,name:'Synthetic paged branch'}));
  const branchesFirst=await ok(x.read());assert.equal(branchesFirst.branches.length,50);assert.ok(branchesFirst.branchesNextCursor);
  const branchesSecond=await ok(x.read(null,x.owner,{p_branch_after:branchesFirst.branchesNextCursor}));assert.equal(branchesSecond.branches.length,3);assert.equal(branchesSecond.branchesNextCursor,null);assert.equal(new Set([...branchesFirst.branches,...branchesSecond.branches].map(branch=>branch.id)).size,53);
  assert.equal((await x.read(null,x.marketing,{p_branch_after:branchesFirst.branchesNextCursor})).error?.message,'forbidden');
 }finally{await x.cleanup();}
});
