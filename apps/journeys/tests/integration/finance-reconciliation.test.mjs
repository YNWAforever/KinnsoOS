import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,admin,anonymous} from './local-fixtures.mjs';
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};

test('financial reconciliation stays complete above rowcap, rejects branch-less staff access, and reviews only real owned sources',async()=>{
 // Fail before creating fixtures if the separately reviewed candidate is not applied.
 const preflight=await anonymous.rpc('get_kinnso_reconciliation',{p_filter:{},p_cursor:null});
 assert.match(preflight.error?.message??'',/unauthenticated|forbidden|permission denied for function get_kinnso_reconciliation/,'K21 candidate RPC must be installed in the approved isolated local database before this test runs');
 const f=await fixture();let merchantId,missionId,opsId;
 try{
  const owner=await f.actor(),finance=await f.actor(),marketing=await f.actor(),outsider=await f.actor(),ops=await f.actor();opsId=ops.id;
  await ok(admin.from('kinnso_ops_members').insert({user_id:ops.id,display_name:'Synthetic finance operator',role:'moderator'}));
  merchantId=randomUUID();missionId=randomUUID();
  await ok(admin.from('merchant_profiles').insert({id:merchantId,user_id:owner.id,company_name:'Synthetic reconciliation owner',contact_email:'synthetic@example.test'}));
  await ok(admin.from('missions').insert({id:missionId,merchant_profile_id:merchantId,title:'Synthetic reconciliation records',summary:'Explicit isolated local test data',mission_type:'coupon_affiliate',status:'published'}));
  const branchId=randomUUID();const command=payload=>ok(owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:merchantId,p_request_id:randomUUID(),p_command:payload}));
  await command({type:'createBranch',id:branchId,name:'Assigned branch'});
  for(const [actor,role]of [[finance,'finance'],[marketing,'marketing']])await command({type:'setMember',userId:actor.id,role,branchIds:[branchId],active:true});
  // Synthetic legacy obligations intentionally have no validation/creator proof.
  // The projection must show recorded, never silently call these eligible or paid.
  const ids=Array.from({length:1205},()=>randomUUID());
  for(let start=0;start<ids.length;start+=200)await ok(admin.from('mission_settlements').insert(ids.slice(start,start+200).map((id,i)=>({id,mission_id:missionId,status:'pending',paid_fee_amount:(start+i)%2?'2.00':'1.00',amount_currency:(start+i)%2?'USD':'HKD'}))));
  const unknownId=randomUUID(),unsupportedId=randomUUID();
  await ok(admin.from('mission_settlements').insert([{id:unknownId,mission_id:missionId,status:'pending',paid_fee_amount:5,amount_currency:null},{id:unsupportedId,mission_id:missionId,status:'pending',paid_fee_amount:7,amount_currency:'ZZZ'}]));
  const filter={merchantId,missionId};const first=await ok(owner.client.rpc('get_kinnso_reconciliation',{p_filter:filter}));
  assert.equal(first.items.length,50);assert.ok(first.nextCursor);
  const totals=first.totals.map(b=>[b.currency,b.minorAmount,b.count,b.blockedAmountCount]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  assert.deepEqual(totals,[['HKD','60300',603,0],[null,null,1,1],['USD','120400',602,0],['ZZZ',null,1,1]].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const seen=new Set();let cursor=null;
  do{const page=await ok(owner.client.rpc('get_kinnso_reconciliation',{p_filter:filter,p_cursor:cursor}));for(const row of page.items){assert.equal(row.missionId,missionId);assert.equal(row.state,'recorded');assert.equal(row.proof.eligible,false);assert.equal(row.proof.paid,false);assert.equal(seen.has(row.key),false);seen.add(row.key);}cursor=page.nextCursor;}while(cursor);
  assert.equal(seen.size,1207);
  const scoped=await ok(finance.client.rpc('get_kinnso_reconciliation',{p_filter:filter}));assert.equal(scoped.items.length,0);assert.equal(scoped.totals.length,0);
  assert.equal((await marketing.client.rpc('get_kinnso_reconciliation',{p_filter:filter})).error?.message,'forbidden');assert.equal((await outsider.client.rpc('get_kinnso_reconciliation',{p_filter:filter})).error?.message,'forbidden');
  assert.equal((await ops.client.rpc('get_kinnso_reconciliation',{p_filter:{missionId},p_cursor:first.nextCursor})).error?.message,'invalid_cursor');
  assert.equal((await owner.client.rpc('get_kinnso_reconciliation',{p_filter:{...filter,state:'paid'},p_cursor:first.nextCursor})).error?.message,'invalid_cursor');
  const open={type:'open',sourceKey:'settlement:'+ids[0],reason:'Synthetic owned record requires investigation'},openArgs={p_request_id:randomUUID(),p_command:open};
  const opened=await ok(owner.client.rpc('apply_kinnso_reconciliation_review',openArgs));assert.deepEqual(await ok(owner.client.rpc('apply_kinnso_reconciliation_review',openArgs)),opened);
  const duplicate=await ok(owner.client.rpc('apply_kinnso_reconciliation_review',{...openArgs,p_request_id:randomUUID()}));assert.deepEqual(duplicate,opened);
  assert.equal((await outsider.client.rpc('apply_kinnso_reconciliation_review',{...openArgs,p_request_id:randomUUID()})).error?.message,'forbidden');assert.equal((await finance.client.rpc('apply_kinnso_reconciliation_review',{...openArgs,p_request_id:randomUUID()})).error?.message,'forbidden');
  const reviewArgs={p_request_id:randomUUID(),p_command:{type:'review',id:opened.id,expectedRevision:1,status:'waiting_business_rules',reason:'Refund and dispute policy is not yet authorized'}};
  const reviewed=await ok(ops.client.rpc('apply_kinnso_reconciliation_review',reviewArgs));assert.equal(reviewed.revision,2);assert.deepEqual(await ok(ops.client.rpc('apply_kinnso_reconciliation_review',reviewArgs)),reviewed);
  assert.equal((await ops.client.rpc('apply_kinnso_reconciliation_review',{...reviewArgs,p_request_id:randomUUID()})).error?.message,'revision_conflict');
  const exceptions=await ok(owner.client.rpc('get_kinnso_reconciliation',{p_filter:{...filter,exceptionsOnly:true}}));
  let reviewRow;cursor=null;do{const page=await ok(owner.client.rpc('get_kinnso_reconciliation',{p_filter:filter,p_cursor:cursor}));reviewRow??=page.items.find(r=>r.sourceId===ids[0]);cursor=page.nextCursor;}while(cursor&&!reviewRow);
  assert.equal(reviewRow.review.ownerId,ops.id);assert.equal(reviewRow.review.status,'waiting_business_rules');assert.equal(reviewRow.review.history.length,2);assert.equal(reviewRow.proof.paid,false);assert.equal(exceptions.capabilities.refund,false);
  for(const table of ['reconciliation_cases','reconciliation_history']){assert.ok((await owner.client.schema('kinnso_internal').from(table).select('*')).error);assert.ok((await admin.schema('kinnso_internal').from(table).select('*')).error);}
  await ok(admin.from('kinnso_ops_members').update({status:'paused'}).eq('user_id',ops.id));assert.equal((await ops.client.rpc('get_kinnso_reconciliation',{p_filter:{missionId}})).error?.message,'forbidden');assert.equal((await ops.client.rpc('apply_kinnso_reconciliation_review',reviewArgs)).error?.message,'forbidden');
  await command({type:'setMember',userId:finance.id,role:'finance',branchIds:[branchId],active:false});assert.equal((await finance.client.rpc('get_kinnso_reconciliation',{p_filter:filter})).error?.message,'forbidden');
 }finally{
  // Review FKs deliberately preserve source history. A dedicated synthetic fixture
  // cleanup uses the DB-owner transport already established by the local harness;
  // service_role has no direct privilege on these internal history tables.
  if(missionId)await cleanupReviewFixture(missionId);
  if(missionId)await ok(admin.from('missions').delete().eq('id',missionId));if(merchantId)await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));
  if(opsId)await ok(admin.from('kinnso_ops_members').delete().eq('user_id',opsId));await f.cleanup();
 }
});

test('real claim/redemption and receipt approval keep proof, branch visibility, paid legs and source-linked reviews distinct',{concurrency:false},async()=>{
 const preflight=await anonymous.rpc('get_kinnso_reconciliation',{p_filter:{},p_cursor:null});
 assert.match(preflight.error?.message??'',/unauthenticated|forbidden|permission denied for function get_kinnso_reconciliation/,'Install reviewed K21 candidate before creating owned test fixtures');
 const f=await fixture();let merchantId,visitMissionId,receiptMissionId,opsId,batchId;const offerIds=[];
 try{
  const owner=await f.actor(),replacementOwner=await f.actor(),finance=await f.actor(),clerk=await f.actor(),visitor=await f.actor(),creator=await f.actor(true),ops=await f.actor();opsId=ops.id;
  await ok(admin.from('kinnso_ops_members').insert({user_id:ops.id,display_name:'Synthetic reconciliation reviewer',role:'admin'}));
  merchantId=randomUUID();visitMissionId=randomUUID();receiptMissionId=randomUUID();
  await ok(admin.from('merchant_profiles').insert({id:merchantId,user_id:owner.id,company_name:'Synthetic proof transitions',contact_email:'synthetic@example.test'}));
  await ok(admin.from('missions').insert([
   {id:visitMissionId,merchant_profile_id:merchantId,mission_source:'merchant',mission_type:'coupon_affiliate',status:'published',title:'Synthetic visit proof',summary:'Explicit isolated claim/redemption proof'},
   {id:receiptMissionId,merchant_profile_id:merchantId,mission_source:'merchant',mission_type:'receipt_cashback',status:'published',title:'Synthetic receipt proof',summary:'Explicit isolated human approval proof',paid_fee_amount:'35.05',paid_fee_currency:'HKD',max_receipts_per_creator:2}
  ]));
  await ok(admin.from('mission_participants').insert([visitMissionId,receiptMissionId].map(mission_id=>({mission_id,creator_id:creator.id,status:'active',source:'open_join'}))));
  const branchA=randomUUID(),branchB=randomUUID();
  const merchantCommand=payload=>ok(owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:merchantId,p_request_id:randomUUID(),p_command:payload}));
  await merchantCommand({type:'createBranch',id:branchA,name:'Assigned proof branch'});await merchantCommand({type:'createBranch',id:branchB,name:'Other proof branch'});
  for(const [actor,role]of [[finance,'finance'],[clerk,'clerk']])await merchantCommand({type:'setMember',userId:actor.id,role,branchIds:[branchA],active:true});
  const read=(actor,missionId)=>ok(actor.client.rpc('get_kinnso_reconciliation',{p_filter:{merchantId,missionId}}));
  const open=(actor,sourceKey,reason='Synthetic owned source needs reconciliation')=>({p_request_id:randomUUID(),p_command:{type:'open',sourceKey,reason}});
  async function createClaim(commission){
   const offerId=randomUUID();offerIds.push(offerId);
   await ok(admin.from('merchant_offers').insert({id:offerId,merchant_profile_id:merchantId,mission_id:visitMissionId,title:'Synthetic local offer',terms:'No real redemption or money transfer',discount_kind:'item',discount_value:1,commission_kind:'flat',commission_value:commission,valid_from:new Date(Date.now()-3600000).toISOString(),valid_to:new Date(Date.now()+86400000).toISOString(),status:'live'}));
   // Genuine mature attribution RPC; do not directly insert its claim row.
   const claim=await ok(visitor.client.rpc('claim_offer',{p_offer_id:offerId,p_creator_id:creator.id,p_source:'profile',p_guide_id:null}));
   assert.ok(claim.claim_id);assert.ok(claim.raw_token);return{offerId,...claim};
  }
  const claimA=await createClaim('12.34');
  const claimed=await read(owner,visitMissionId);assert.equal(claimed.items.length,1);assert.equal(claimed.items[0].kind,'claim');assert.equal(claimed.items[0].sourceId,claimA.claim_id);assert.equal(claimed.items[0].state,'claimed');assert.equal(claimed.items[0].proof.claimed,true);assert.equal(claimed.items[0].proof.redeemed,false);assert.equal(claimed.items[0].proof.eligible,false);assert.equal(claimed.items[0].minorAmount,null);
  assert.equal((await read(finance,visitMissionId)).items.length,0,'a branch-less claim is not proven to belong to a staff branch');
  const redeemArgs={p_raw_token:claimA.raw_token,p_branch_id:branchA,p_request_id:randomUUID(),p_amount_spent:null};
  const redemptions=await Promise.all([clerk.client.rpc('redeem_kinnso_offer',redeemArgs),clerk.client.rpc('redeem_kinnso_offer',{...redeemArgs,p_request_id:randomUUID()})]);
  for(const r of redemptions)assert.equal(r.error,null,JSON.stringify(r.error));assert.equal(new Set(redemptions.map(r=>r.data.redemption_id)).size,1);
  assert.deepEqual(await ok(clerk.client.rpc('redeem_kinnso_offer',redeemArgs)),redemptions[0].data);
  const redemption=await ok(admin.from('offer_redemptions').select('id,settlement_id').eq('offer_claim_id',claimA.claim_id).single());assert.ok(redemption.settlement_id);
  const minted=await ok(admin.from('mission_settlements').select('id,source').eq('mission_id',visitMissionId));assert.equal(minted.length,1);assert.equal(minted[0].source,'visit_redemption');
  const scoped=await read(finance,visitMissionId);assert.equal(scoped.items.length,1);const obligation=scoped.items[0];
  assert.equal(obligation.kind,'settlement');assert.equal(obligation.sourceId,redemption.settlement_id);assert.equal(obligation.branchId,branchA);assert.equal(obligation.state,'eligible');assert.equal(obligation.sourceStatus,'not_started');assert.equal(obligation.minorAmount,'1234');assert.equal(obligation.currency,'HKD');
  assert.deepEqual(obligation.proof,{claimed:true,redeemed:true,validated:true,eligible:true,settled:false,paid:false});assert.equal(obligation.references.claimId,claimA.claim_id);assert.equal(obligation.references.redemptionId,redemption.id);
  assert.equal(scoped.totals.length,1);assert.equal(scoped.totals[0].minorAmount,'1234');assert.equal(scoped.totals[0].basis,'creator_obligation');assert.equal(scoped.totals[0].count,1);
  const ownerAfter=await read(owner,visitMissionId);assert.equal(ownerAfter.items.length,1);assert.equal(ownerAfter.items.some(r=>r.kind==='claim'),false,'minted claim predecessor must not be counted twice');assert.equal(ownerAfter.totals[0].minorAmount,'1234');
  assert.equal(JSON.stringify(ownerAfter).includes(claimA.raw_token),false,'raw claim secret must never be projected');
  const financeOpenArgs=open(finance,obligation.key);const financeCase=await ok(finance.client.rpc('apply_kinnso_reconciliation_review',financeOpenArgs));assert.deepEqual(await ok(finance.client.rpc('apply_kinnso_reconciliation_review',financeOpenArgs)),financeCase);

  const claimB=await createClaim('0.01');await ok(owner.client.rpc('redeem_kinnso_offer',{p_raw_token:claimB.raw_token,p_branch_id:branchB,p_request_id:randomUUID(),p_amount_spent:null}));
  const ownerBoth=await read(owner,visitMissionId);assert.equal(ownerBoth.items.length,2);assert.equal(ownerBoth.totals[0].minorAmount,'1235');assert.equal((await read(finance,visitMissionId)).items.length,1);

  // These RPCs record synthetic paid/promise statuses only. No provider, account,
  // rail, webhook or actual transfer is invoked by this test.
  const batch=await ok(ops.client.rpc('admin_create_payout_batch',{p_creator_id:creator.id,p_currency:'HKD',p_amount:'999.99',p_idempotency_key:randomUUID(),p_reason:'Synthetic local unallocated payout promise'}));batchId=batch.batch_id;
  await ok(ops.client.rpc('admin_mark_payout_paid',{p_batch_id:batchId,p_reason:'Synthetic local paid status; no money transfer'}));
  const paidPromise=await findFinanceRow(ops,{state:'paid'},'payout_batch:'+batchId);
  assert.equal(paidPromise.basis,'payout_promise');assert.equal(paidPromise.minorAmount,'99999');assert.equal(paidPromise.proof.paid,true);assert.equal(paidPromise.proof.settled,false);assert.ok(paidPromise.exceptions.includes('not_allocated_to_settlements'));
  const stillUnpaid=(await read(finance,visitMissionId)).items[0];assert.equal(stillUnpaid.state,'eligible');assert.equal(stillUnpaid.proof.paid,false);assert.equal(stillUnpaid.minorAmount,'1234','paid promise must not be allocated to this obligation');
  assert.equal((await read(owner,visitMissionId)).items.some(r=>r.kind==='payout_batch'),false,'merchant must not see creator-wide promises');
  await ok(ops.client.rpc('admin_set_settlement_status',{p_id:obligation.sourceId,p_status:'partially_paid',p_reason:'Synthetic recorded settlement progress'}));
  const partially=(await read(finance,visitMissionId)).items[0];assert.equal(partially.state,'settled');assert.equal(partially.sourceStatus,'partially_paid');assert.equal(partially.proof.settled,true);assert.equal(partially.proof.paid,false);
  await ok(ops.client.rpc('admin_set_settlement_status',{p_id:obligation.sourceId,p_creator_payout_status:'paid',p_reason:'Synthetic recorded creator payout leg'}));
  const paidLeg=(await read(finance,visitMissionId)).items[0];assert.equal(paidLeg.state,'paid');assert.equal(paidLeg.sourceStatus,'partially_paid');assert.equal(paidLeg.proof.paid,true);assert.equal(paidLeg.minorAmount,'1234');assert.equal(paidLeg.review.id,financeCase.id);

  const firstReceipt=await ok(creator.client.rpc('submit_receipt',{p_mission_id:receiptMissionId,p_proof_urls:[`https://example.test/receipts/${randomUUID()}.jpg`]}));
  const rejectSource='receipt:'+firstReceipt.submission_id,rejectOpenArgs=open(owner,rejectSource);const rejectionCase=await ok(owner.client.rpc('apply_kinnso_reconciliation_review',rejectOpenArgs));
  const pendingReceipt=(await read(owner,receiptMissionId)).items[0];assert.equal(pendingReceipt.sourceStatus,'submitted');assert.equal(pendingReceipt.state,'recorded');assert.equal(pendingReceipt.proof.validated,false);assert.equal(pendingReceipt.proof.eligible,false);assert.equal(pendingReceipt.review.id,rejectionCase.id);
  await ok(ops.client.rpc('admin_review_submission',{p_submission_id:firstReceipt.submission_id,p_action:'reject',p_reason_category:'unreadable',p_reason_text:'Synthetic image cannot be read'}));
  const rejected=(await read(owner,receiptMissionId)).items[0];assert.equal(rejected.kind,'receipt');assert.equal(rejected.sourceStatus,'rejected');assert.equal(rejected.state,'recorded');assert.equal(rejected.proof.validated,false);assert.ok(rejected.exceptions.includes('receipt_rejected'));assert.equal(rejected.review.id,rejectionCase.id);assert.equal(rejected.review.history.length,1);
  assert.equal((await ok(admin.from('mission_settlements').select('id').eq('mission_milestone_submission_id',firstReceipt.submission_id))).length,0);
  const secondReceipt=await ok(creator.client.rpc('submit_receipt',{p_mission_id:receiptMissionId,p_proof_urls:[`https://example.test/receipts/${randomUUID()}.jpg`]}));assert.notEqual(secondReceipt.submission_id,firstReceipt.submission_id);
  const approveOpenArgs=open(owner,'receipt:'+secondReceipt.submission_id,'Synthetic pending receipt needs owned review');const approvalCase=await ok(owner.client.rpc('apply_kinnso_reconciliation_review',approveOpenArgs));
  await ok(ops.client.rpc('admin_review_submission',{p_submission_id:secondReceipt.submission_id,p_action:'approve',p_reason_category:null,p_reason_text:null}));
  const receiptPage=await read(owner,receiptMissionId);assert.equal(receiptPage.items.length,2,'rejected receipt remains, approved predecessor is replaced by one settlement');
  const approved=receiptPage.items.find(r=>r.references.submissionId===secondReceipt.submission_id);assert.ok(approved);assert.equal(approved.kind,'settlement');assert.equal(approved.state,'eligible');assert.equal(approved.sourceStatus,'pending');assert.equal(approved.proof.validated,true);assert.equal(approved.proof.eligible,true);assert.equal(approved.proof.settled,false);assert.equal(approved.proof.paid,false);assert.equal(approved.minorAmount,'3505');assert.equal(approved.review.id,approvalCase.id);assert.equal(approved.review.history.length,1);
  assert.equal(receiptPage.items.some(r=>r.kind==='receipt'&&r.sourceId===secondReceipt.submission_id),false);assert.equal(receiptPage.totals.find(b=>b.basis==='creator_obligation').minorAmount,'3505');
  assert.equal((await read(finance,receiptMissionId)).items.length,0,'receipt obligations have no assigned-branch proof');
  assert.equal((await ok(admin.from('mission_settlements').select('id').eq('mission_milestone_submission_id',secondReceipt.submission_id))).length,1);
  assert.equal((await ops.client.rpc('admin_review_submission',{p_submission_id:secondReceipt.submission_id,p_action:'approve',p_reason_category:null,p_reason_text:null})).error?.message,'stale_status');
  const settlementCase=await ok(owner.client.rpc('apply_kinnso_reconciliation_review',open(owner,approved.key)));assert.equal(settlementCase.id,approvalCase.id,'receipt case follows its minted settlement');
  assert.deepEqual(await ok(owner.client.rpc('apply_kinnso_reconciliation_review',approveOpenArgs)),approvalCase,'original receipt review receipt remains idempotent after minting');
  const review=await ok(ops.client.rpc('apply_kinnso_reconciliation_review',{p_request_id:randomUUID(),p_command:{type:'review',id:approvalCase.id,expectedRevision:1,status:'waiting_business_rules',reason:'Synthetic fee/refund decision remains externally blocked'}}));assert.equal(review.revision,2);
  const retained=(await read(owner,receiptMissionId)).items.find(r=>r.sourceId===approved.sourceId);assert.equal(retained.review.history.length,2);assert.equal(retained.review.ownerId,ops.id);assert.equal(retained.review.status,'waiting_business_rules');assert.equal(retained.minorAmount,'3505');assert.equal(retained.proof.paid,false);
  assert.doesNotMatch(JSON.stringify(receiptPage),/proof_urls|example\.test\/receipts\//,'private uploaded receipt URLs must not be projected');

  // A preserved historical settlement may have no receipt FK. Keep its amount
  // once, show the approved receipt as attribution only, and never guess linkage.
  await ok(admin.from('mission_settlements').update({mission_milestone_submission_id:null}).eq('id',approved.sourceId));
  const unlinkedPage=await read(owner,receiptMissionId);
  const unlinked=unlinkedPage.items.find(row=>row.sourceId===approved.sourceId);
  const orphanReceipt=unlinkedPage.items.find(row=>row.kind==='receipt'&&row.sourceId===secondReceipt.submission_id);
  assert.equal(unlinked.minorAmount,'3505');assert.equal(unlinked.proof.validated,false);assert.equal(unlinked.proof.eligible,false);
  assert.equal(unlinked.references.submissionId,null);assert.equal(unlinked.review,null);
  assert.ok(unlinked.exceptions.includes('receipt_linkage_unknown'));assert.ok(unlinked.exceptions.includes('receipt_approval_unverified'));
  assert.equal(unlinked.exceptions.includes('receipt_not_approved'),false,'unknown approval must not be reported as rejected');
  assert.equal(orphanReceipt.minorAmount,null);assert.equal(orphanReceipt.basis,'attribution');assert.equal(orphanReceipt.review.id,approvalCase.id);
  assert.ok(orphanReceipt.exceptions.includes('no_linked_obligation'));assert.equal(orphanReceipt.exceptions.includes('no_minted_obligation'),false);
  assert.equal(unlinkedPage.totals.filter(row=>row.basis==='creator_obligation').reduce((sum,row)=>sum+BigInt(row.minorAmount),0n),3505n);
  const unlinkedCase=await ok(owner.client.rpc('apply_kinnso_reconciliation_review',open(owner,approved.key)));
  assert.notEqual(unlinkedCase.id,approvalCase.id,'unproved linkage must not merge operational histories');
  assert.equal((await read(owner,receiptMissionId)).items.find(row=>row.sourceId===approved.sourceId).review.id,unlinkedCase.id);
  await verifyHistoricalReceiptColumnAbsent(owner,merchantId,receiptMissionId,approved.sourceId);
  await ok(admin.from('mission_settlements').update({mission_milestone_submission_id:secondReceipt.submission_id}).eq('id',approved.sourceId));

  // Branch reassignment revokes old case acknowledgement even for the same request.
  await merchantCommand({type:'setMember',userId:finance.id,role:'finance',branchIds:[branchB],active:true});
  const reassigned=await read(finance,visitMissionId);assert.equal(reassigned.items.length,1);assert.equal(reassigned.items[0].branchId,branchB);assert.equal(reassigned.items[0].minorAmount,'1');
  assert.equal((await finance.client.rpc('apply_kinnso_reconciliation_review',financeOpenArgs)).error?.message,'forbidden');
  await merchantCommand({type:'setMember',userId:finance.id,role:'finance',branchIds:[branchB],active:false});assert.equal((await finance.client.rpc('apply_kinnso_reconciliation_review',financeOpenArgs)).error?.message,'forbidden');
  // Ownership transfer similarly revokes an already successful receipt-linked request.
  await ok(admin.from('merchant_profiles').update({user_id:replacementOwner.id}).eq('id',merchantId));
  assert.equal((await owner.client.rpc('apply_kinnso_reconciliation_review',approveOpenArgs)).error?.message,'forbidden');assert.equal((await owner.client.rpc('get_kinnso_reconciliation',{p_filter:{merchantId,missionId:receiptMissionId}})).error?.message,'forbidden');
  assert.equal((await read(replacementOwner,receiptMissionId)).items.find(r=>r.sourceId===approved.sourceId).review.id,approvalCase.id);
 }finally{
  await cleanupReviewFixture([visitMissionId,receiptMissionId].filter(Boolean),batchId);
  if(merchantId)await ok(admin.from('offer_redemptions').delete().eq('merchant_profile_id',merchantId));if(offerIds.length)await ok(admin.from('offer_claims').delete().in('offer_id',offerIds));
  if(visitMissionId)await ok(admin.from('missions').delete().eq('id',visitMissionId));if(receiptMissionId)await ok(admin.from('missions').delete().eq('id',receiptMissionId));if(merchantId)await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));
  if(opsId){const members=await ok(admin.from('kinnso_ops_members').select('id').eq('user_id',opsId));if(members[0])await ok(admin.from('ops_audit_log').delete().eq('actor_ops_member_id',members[0].id));await ok(admin.from('kinnso_ops_members').delete().eq('user_id',opsId));}await f.cleanup();
 }
});

async function findFinanceRow(actor,filter,key){
 let cursor=null;
 do{const page=await ok(actor.client.rpc('get_kinnso_reconciliation',{p_filter:filter,p_cursor:cursor}));const found=page.items.find(r=>r.key===key);if(found)return found;cursor=page.nextCursor;}while(cursor);
 assert.fail('The expected owned synthetic financial source is absent');
}

async function verifyHistoricalReceiptColumnAbsent(actor,merchantId,missionId,settlementId){
 for(const id of [actor.id,merchantId,missionId,settlementId])assert.match(id,/^[0-9a-f-]{36}$/i);
 const session=await actor.client.auth.getSession();assert.equal(session.error,null);
 const tokenClaims=JSON.parse(Buffer.from(session.data.session.access_token.split('.')[1],'base64url').toString());
 assert.equal(tokenClaims.sub,actor.id);assert.match(tokenClaims.session_id,/^[0-9a-f-]{36}$/i);
 const claims=JSON.stringify({sub:actor.id,session_id:tokenClaims.session_id,is_anonymous:false,role:'authenticated'});
 const {spawnSync}=await import('node:child_process');
 // Exact local target was guarded before fixtures. The column is renamed only
 // inside this transaction; ROLLBACK restores schema and all review writes.
 const sql=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s';
 ALTER TABLE public.mission_settlements RENAME COLUMN mission_milestone_submission_id TO kinnso_fixture_receipt_link;
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claims','${claims}',true) IS NOT NULL;
 DO $guard$ DECLARE result jsonb; fact jsonb; BEGIN
  result:=public.get_kinnso_reconciliation(jsonb_build_object('merchantId','${merchantId}','missionId','${missionId}'),null);
  SELECT value INTO fact FROM jsonb_array_elements(result->'items') WHERE value->>'sourceId'='${settlementId}';
  IF fact IS NULL OR fact->>'minorAmount'<>'3505' OR fact->'proof'->>'validated'<>'false' OR NOT(fact->'exceptions' ? 'receipt_linkage_unknown') THEN RAISE EXCEPTION 'historical_receipt_evidence_failed'; END IF;
  PERFORM public.apply_kinnso_reconciliation_review('${randomUUID()}'::uuid,jsonb_build_object('type','open','sourceKey','settlement:${settlementId}','reason','Synthetic historical schema review stays operational'));
 END $guard$; ROLLBACK;`;
 const probe=spawnSync('docker',['exec','-i',process.env.KINNSO_TEST_DB_CONTAINER,'psql','--no-psqlrc','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:20000});
 assert.equal(probe.status,0,probe.stderr);
}

async function cleanupReviewFixture(missionIds,batchId){
 const ownedMissions=Array.isArray(missionIds)?missionIds:[missionIds];
 for(const id of [...ownedMissions,...batchId?[batchId]:[]])assert.match(id,/^[0-9a-f-]{36}$/i);
 if(!ownedMissions.length&&!batchId)return;
 const {spawnSync}=await import('node:child_process');
 const ids=ownedMissions.map(id=>`'${id}'::uuid`).join(',')||'NULL::uuid';
 const ownedCases=`SELECT c.id FROM kinnso_internal.reconciliation_cases c WHERE c.settlement_id IN (SELECT s.id FROM public.mission_settlements s WHERE s.mission_id IN (${ids})) OR c.submission_id IN (SELECT sub.id FROM public.mission_milestone_submissions sub JOIN public.mission_participants p ON p.id=sub.mission_participant_id WHERE p.mission_id IN (${ids}))`;
 const payoutCleanup=batchId?`ALTER TABLE public.creator_payout_decisions DISABLE TRIGGER creator_payout_decisions_no_delete_trg; DELETE FROM public.creator_payout_decisions WHERE payout_batch_id='${batchId}'::uuid; DELETE FROM public.creator_payout_batches WHERE id='${batchId}'::uuid; ALTER TABLE public.creator_payout_decisions ENABLE TRIGGER creator_payout_decisions_no_delete_trg;`:'';
 const sql=`BEGIN; ALTER TABLE kinnso_internal.reconciliation_history DISABLE TRIGGER reconciliation_history_immutable; DELETE FROM kinnso_internal.reconciliation_history WHERE case_id IN (${ownedCases}); DELETE FROM kinnso_internal.reconciliation_cases WHERE id IN (${ownedCases}); ALTER TABLE kinnso_internal.reconciliation_history ENABLE TRIGGER reconciliation_history_immutable; ${payoutCleanup} COMMIT;`;
 // IDs were generated only inside these fixtures. Guarded isolated DB cleanup
 // restores all immutable triggers inside the same transaction; no provider call.
 const cleanup=spawnSync('docker',['exec','-i',process.env.KINNSO_TEST_DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
 assert.equal(cleanup.status,0,cleanup.stderr);
}
