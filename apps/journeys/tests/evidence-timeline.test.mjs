import {test} from 'node:test';
import assert from 'node:assert/strict';
const subject=await import('../lib/collaboration/evidence-timeline.ts').catch(()=>({}));
function timeline(value){assert.equal(typeof subject.evidenceTimeline,'function','loaded evidence needs a source-only timeline');return subject.evidenceTimeline(value);}
const detail={submissions:[{id:'one',status:'approved',submittedAt:'2026-10-20T10:00:00Z',notes:'Original notes',proofUrls:['PRIVATE_PROOF'],reviews:[{id:'review2',action:'approve',reason:'Accepted revision',createdAt:'2026-10-21T10:00:00Z'},{id:'review1',action:'request_revision',reason:'Clarify source',createdAt:'2026-10-19T10:00:00Z'}]},{id:'repeat',status:'submitted',submittedAt:'2026-10-20T09:00:00Z',notes:null,reviews:[]}]};
test('loaded receipt/review records sort by actual timestamps with stable identity',()=>{
 const result=timeline(detail);
 assert.deepEqual(result.map(x=>[x.kind,x.submissionId,x.at]),[['review','one','2026-10-19T10:00:00Z'],['submission','repeat','2026-10-20T09:00:00Z'],['submission','one','2026-10-20T10:00:00Z'],['review','one','2026-10-21T10:00:00Z']]);
 assert.equal(new Set(result.map(x=>x.key)).size,4);
 assert.equal(result[2].status,'approved','submission record labels current status, not a fabricated original event status');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROOF/);
});
test('missing or invalid timestamps stay unknown; no fake event time or additional writes',()=>{
 const input={submissions:[{id:'unknown',status:'pending',submittedAt:null,notes:null,reviews:[{id:'r',action:'reject',reason:null,createdAt:'not-a-date'}]}]};
 const before=JSON.stringify(input),result=timeline(input);
 assert.ok(result.every(x=>x.at===null));assert.equal(JSON.stringify(input),before);
 assert.equal(result[0].note,null);
});
test('paged duplicate records dedupe by receipt/review identity without collapsing repeatable receipts',()=>{
 const result=timeline({submissions:[detail.submissions[0],detail.submissions[0],detail.submissions[1]]});
 assert.equal(result.length,4);assert.equal(result.filter(x=>x.kind==='submission').length,2);
});
