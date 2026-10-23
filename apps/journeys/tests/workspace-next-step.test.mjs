import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creatorTasks} from '../lib/collaboration/tasks.ts';
import {workspaceHarness} from './helpers/workspace-harness.mjs';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const mission=(id,title,listState)=>({id,title,summary:'Authored campaign brief',merchantName:'Existing company',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',minTier:null,eligible:true,joinAvailable:false,acceptAvailable:false,evidenceAvailable:true,requiresApplication:true,paidFeeAmount:null,paidFeeCurrency:null,creatorRate:'0',startsAt:null,endsAt:null,applicationOpensAt:null,applicationClosesAt:null,scheduleTimeZone:'UTC',participant:{id,status:'active',source:'open_join',applicationNote:null,merchantReviewNote:null,updatedAt:'2026-10-23T01:00:00Z'},listState,nextDueAt:'2030-01-02T12:00:00Z'});
test('Creator next actions consume the existing list aggregate state and deadline without requiring private detail',()=>{
 const rows=[mission(a,'Revision work','revision_requested'),mission(b,'Submitted work','submitted')],before=JSON.stringify(rows);
 assert.deepEqual(creatorTasks(rows,'en').map(action=>[action.kind,action.entityId,action.dueAt]),[['revise',a,'2030-01-02T12:00:00Z'],['await-review',b,'2030-01-02T12:00:00Z']]);
 assert.equal(JSON.stringify(rows),before);
});
for(const locale of ['en','zh-HK'])test(`Creator summary ${locale}: revision is to-do, submitted work waits, and no detail or command is invoked`,async()=>{
 let reads=0,privateReads=0,writes=0;
 const h=await workspaceHarness('CreatorCollaborationTasks',{creatorMissions:{list:async()=>{reads++;return{ok:true,data:{items:[mission(a,'Revision work','revision_requested'),mission(b,'Submitted work','submitted')],nextCursor:'more-owned-records'}};},get:async()=>{privateReads++;throw Error('Overview cannot request detail');},command:async()=>{writes++;throw Error('Overview cannot write');}}},{locale});
 const section=label=>h.elements().find(el=>el.type==='section'&&[el.props.children].flat(Infinity).some(child=>child?.type==='h3'&&h.text(child)===label));
 assert.match(h.text(section(locale==='en'?'To do':'待我處理')),/Revision work/);
 assert.match(h.text(section(locale==='en'?'Waiting for others':'等候對方')),/Submitted work/);
 assert.equal(reads,1);assert.equal(privateReads,0);assert.equal(writes,0);
 h.invalidate();assert.doesNotMatch(h.text(),/Revision work|Submitted work/);
});

for(const locale of ['en','zh-HK'])for(const source of ['travelpayouts',undefined])for(const stage of ['application','submission'])test('Creator '+locale+' '+(source??'unknown-source')+' '+stage+': waiting copy does not invent a merchant reviewer',async()=>{
 const row={...mission(a,'Source-aware work','submitted'),missionSource:source,merchantName:null,missionType:'receipt_cashback'};
 if(stage==='application')row.participant={...row.participant,status:'applied'};
 let reads=0,writes=0;
 const h=await workspaceHarness('CreatorCollaborationTasks',{creatorMissions:{list:async()=>{reads++;return{ok:true,data:{items:[row],nextCursor:null}};},get:async()=>{throw Error('No detail fan-out');},command:async()=>{writes++;throw Error('No task writes');}}},{locale});
 const waiting=h.elements().find(el=>el.type==='section'&&[el.props.children].flat(Infinity).some(child=>child?.type==='h3'&&h.text(child)===(locale==='en'?'Waiting for others':'等候對方')));
 assert.ok(waiting);assert.match(h.text(waiting),/Source-aware work/);
 assert.doesNotMatch(h.text(waiting),locale==='en'?/\bmerchant\b/i:/商戶/);
 assert.ok(h.elements().some(el=>el.type==='a'&&el.props.href==='/'+locale+'/studio/missions/'+a));
 assert.equal(reads,1);assert.equal(writes,0);
});
