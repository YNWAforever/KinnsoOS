import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as fixtureModule from '../scripts/performance/operations-fixture.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const fixture={campaignId:id(2),campaignIds:[id(2)],merchantId:id(3),merchantUserId:id(4),merchantClaims:{role:'authenticated',sub:id(4)}};
const options={fixture,creatorId:id(1),creatorClaims:{role:'authenticated',sub:id(1)},guideId:id(5),tripId:id(6),city:"Owned ' city"};
function batch(operation,extra={}) {
 assert.equal(typeof fixtureModule.postgresReadBatch,'function','the collector needs a bounded lock-compatible read batch');
 return fixtureModule.postgresReadBatch({operation,...options,...extra});
}
test('actual latency collector measures both merchant groups with authorization locks and rollback',async()=>{
 const source=await readFile(new URL('../scripts/performance/run-latency.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  for(const operation of measuredPages) {'),end=source.indexOf('\n} catch(error)',start),inputs=[],report={warmups:[],samples:[]};
 assert.ok(start>=0&&end>start);
 const sql=input=>{inputs.push(input);return Array.from({length:43},(_,i)=>'SAMPLE_'+(i+1)+'\n'+JSON.stringify([{Plan:{'Actual Rows':1},'Execution Time':1,'Planning Time':0}])).join('\n');};
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('measuredPages','workspacePages','operationRead','workFixture','claims','literal','guideId','tripId','catalogSQL','sql','report','operationRole','writeFile','path','out','ownerId','tag','postgresReadBatch',source.slice(start,end));
 await run(['merchantCampaigns','merchantReview'],['merchantCampaigns','merchantReview'],fixtureModule.operationRead,fixture,options.creatorClaims,v=>"'"+String(v).replaceAll("'","''")+"'",options.guideId,options.tripId,()=>'',sql,report,()=> 'merchant_owner',async()=>{},{join:(...p)=>p.join('/')},'/owned',options.creatorId,options.city,fixtureModule.postgresReadBatch);
 assert.equal(inputs.length,2);
 for(const input of inputs){assert.match(input,/^begin read write;/i,'merchant authorization row locks require a lock-compatible transaction');assert.match(input,/set local role authenticated;/);assert.match(input,/query_kinnso_merchant_campaigns\(/);assert.match(input,/rollback;\s*$/);assert.doesNotMatch(input,/\bcommit\b/i);assert.equal((input.match(/explain \(analyze/g)||[]).length,43);}
 assert.equal(report.samples.length,80);assert.equal(report.warmups.length,6);
 assert.ok(report.samples.every(s=>s.transactionMode==='READ WRITE/ROLLBACK'));
});
test('only the exact merchant read profiles get the lock-compatible exception',()=>{
 for(const operation of ['merchantCampaigns','merchantReview']){const b=batch(operation);assert.equal(b.transactionMode,'READ WRITE/ROLLBACK');assert.match(b.sql,/query_kinnso_merchant_campaigns\(/);assert.equal((b.sql.match(/SAMPLE_/g)||[]).length,43);assert.match(b.sql,/set local statement_timeout='8s'/);assert.match(b.sql,/rollback;$/);assert.doesNotMatch(b.sql,/apply_|command|\bcommit\b/i);}
 for(const operation of ['home','explore','guide','trip','creatorList','creatorDetail']){const b=batch(operation);assert.equal(b.transactionMode,'READ ONLY/ROLLBACK');assert.match(b.sql,/^begin read only;/);assert.match(b.sql,/rollback;$/);}
 for(const operation of ['merchant','apply_kinnso_merchant_campaign_command','unknown','merchantReview; commit;'])assert.throws(()=>batch(operation),/Unsupported/);
});
test('read batches reject foreign or privileged actor claims before executing SQL',()=>{
 for(const creatorClaims of [{role:'service_role',sub:id(1)},{role:'authenticated',sub:id(9)},{role:'authenticated'},{role:'anon',sub:id(1)}])for(const operation of ['trip','creatorList','creatorDetail'])assert.throws(()=>batch(operation,{creatorClaims}),/actor/);
 for(const merchantClaims of [{role:'service_role',sub:id(4)},{role:'authenticated',sub:id(9)},{role:'anon',sub:id(4)}])for(const operation of ['merchantCampaigns','merchantReview'])assert.throws(()=>batch(operation,{fixture:{...fixture,merchantClaims}}),/actor/);
});
test('SQL bindings accept quoted catalog text while rejecting malformed private IDs',()=>{
 assert.match(batch('explore').sql,/city='Owned '' city'/);
 for(const key of ['merchantId','campaignId','merchantUserId'])assert.throws(()=>batch('merchantReview',{fixture:{...fixture,[key]:"'; commit; --"}}),/identity|actor/);
 assert.throws(()=>batch('guide',{guideId:'not-an-id'}),/identity/);
 assert.throws(()=>batch('trip',{tripId:'not-an-id'}),/identity/);
});
