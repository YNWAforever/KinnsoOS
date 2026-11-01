import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const reports = await studioModule('creator-reports');
const payload = {title:'Own guide',city:'Hong Kong',summary:'Own summary',content:{days:[{offset:0,title:'Walk',stops:[{title:'Harbour',description:'Own note',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}]}};
const guide = {id:'g',revision:3,publishedVersion:1,sourceChanged:false,status:'published',payload,title:payload.title,city:payload.city,summary:payload.summary};
const base = {id:'r',ownerId:'actor',question:'What needs attention?',asOf:'2026-10-31T08:00:00Z'};
test('C2 reports actual missing content and never grants publication approval',()=>{
  assert.equal(typeof reports.createCreatorReport,'function');
  const report=reports.createCreatorReport({...base,templateId:'C2',source:{kind:'guide',value:{...guide,payload:{...payload,summary:''}}}});
  assert.equal(report.source.value.revision,3);assert.ok(report.findings.some(f=>f.code==='summary'&&f.state==='needs-work'));
  assert.equal(report.approval,false);assert.equal(report.visibility,'private');assert.ok(report.gaps.length);
});
test('C3 requested period filters records without inventing totals or external metrics',()=>{
  assert.equal(typeof reports.createCreatorReport,'function');
  const items=[{id:'a',kind:'affiliate',title:'Tracked A',missionId:null,amount:'12',currency:'HKD',status:'pending',updatedAt:'2026-10-05T00:00:00Z',targetAt:null},{id:'b',kind:'affiliate',title:'Old B',missionId:null,amount:'9',currency:'USD',status:'paid',updatedAt:'2026-09-30T00:00:00Z',targetAt:null},{id:'c',kind:'affiliate',title:'Undated',missionId:null,amount:null,currency:null,status:'pending',updatedAt:null,targetAt:null}];
  const r=reports.createCreatorReport({...base,templateId:'C3',period:{from:'2026-10-01',to:'2026-10-31'},source:{kind:'earnings',value:{section:'tracked',items,totals:[{currency:'HKD',pending:'100',paid:'50'}],nextCursor:'next'}}});
  assert.deepEqual(r.performance.records.map(i=>i.id),['a']);assert.equal(r.performance.denominator,null);assert.equal(r.performance.externalSignals,null);assert.equal(r.performance.payoutConfirmed,false);assert.equal(r.performance.coverage,'partial-page');assert.equal(r.performance.sourceTotals[0].pending,'100');assert.equal(r.performance.undatedCount,1);
  assert.throws(()=>reports.createCreatorReport({...base,templateId:'C3',period:{from:'2026-11-01',to:'2026-10-31'},source:r.source}),/PERIOD/);
});
test('C4 does not prepare submission for an invited participant or truncate feedback',()=>{
  assert.equal(typeof reports.createCreatorReport,'function');
  const mission={id:'m',title:'M',participant:{status:'invited'},requirements:['R'],deliverables:['D'],submissions:[],milestones:[],milestonesTruncated:false,submissionsNextCursor:null};
  assert.throws(()=>reports.createCreatorReport({...base,templateId:'C4',source:{kind:'mission',value:mission}}),/FORBIDDEN/);
  const r=reports.createCreatorReport({...base,templateId:'C4',source:{kind:'mission',value:{...mission,participant:{status:'active'},submissions:[{id:'s',milestoneId:'ms',status:'revision_requested',merchantFeedback:'Please include disclosure',updatedAt:'2026-10-30T01:00:00Z',proofUrls:['https://example.invalid/proof'],notes:'Previous',reviews:[]}],submissionsNextCursor:'more'}}});
  assert.match(r.evidence.map(e=>e.text).join('\n'),/Please include disclosure/);assert.equal(r.approval,false);assert.ok(r.gaps.some(g=>g.includes('後頁')));
});
test('C5 proposal leaves original and traveller version intact and gives concrete diff',()=>{
  assert.equal(typeof reports.createCreatorReport,'function');
  const r=reports.createCreatorReport({...base,templateId:'C5',source:{kind:'guide',value:guide}});
  r.proposal.summary='New own summary';
  assert.equal(guide.payload.summary,'Own summary');
  const diff=reports.creatorVersionDiff(r);
  assert.deepEqual(diff,[{field:'summary',label:'摘要',before:'Own summary',after:'New own summary'}]);
  assert.equal(r.source.value.publishedVersion,1);assert.equal(r.changesAdoptedCopies,false);
});
test('a saved report is not verified when the independent readback differs',async()=>{
  assert.equal(typeof reports.saveVerifiedCreatorReport,'function');
  const report=reports.createCreatorReport({...base,templateId:'C2',source:{kind:'guide',value:guide}});
  const intent={requestId:'request',expectedRevision:0,report};
  let seen;
  const store={stage:async x=>({ok:true,data:x}),intent:async()=>({ok:true,data:intent}),save:async x=>{seen=x;return{ok:true,data:{...report,revision:1}}},get:async()=>({ok:true,data:{...report,revision:1,notes:'unrelated content'}})};
  const result=await reports.saveVerifiedCreatorReport(store,intent);assert.equal(result.ok,false);assert.equal(result.retryable,true);assert.deepEqual(seen,intent);
});
test('report verification preserves exact original request and successful readback',async()=>{
  assert.equal(typeof reports.saveVerifiedCreatorReport,'function');
  const report=reports.createCreatorReport({...base,templateId:'C2',source:{kind:'guide',value:guide}});
  const intent={requestId:'same-request',expectedRevision:0,report};let calls=[];
  const saved={...report,revision:1};
  const store={stage:async x=>({ok:true,data:x}),intent:async()=>({ok:true,data:intent}),save:async x=>{calls.push(structuredClone(x));return{ok:true,data:saved}},get:async()=>({ok:true,data:saved})};
  assert.equal((await reports.saveVerifiedCreatorReport(store,intent)).ok,true);
  await reports.saveVerifiedCreatorReport(store,intent);assert.deepEqual(calls[0],calls[1]);assert.equal(intent.report.revision,0);
});
