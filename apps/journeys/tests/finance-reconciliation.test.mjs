import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {toMinorUnits,displayMinorUnits} from '../lib/finance/money.ts';

test('money conversion preserves exact smallest units beyond safe integer range and rejects precision loss',()=>{
 assert.equal(toMinorUnits('9007199254740993.01','HKD'),'900719925474099301');
 assert.equal(toMinorUnits('0.10','USD'),'10');assert.equal(toMinorUnits('1.230000','HKD'),'123');
 assert.equal(displayMinorUnits('900719925474099301','HKD'),'HKD 9007199254740993.01');
 for(const amount of ['1.001','-0.01','NaN','Infinity','1e2',' 1.00','1.','+1',null])assert.equal(toMinorUnits(amount,'HKD'),null);
 for(const currency of [null,'','JPY','ZZZ','hkd','__proto__','constructor'])assert.equal(toMinorUnits('12.34',currency),null);
 assert.equal(displayMinorUnits('1','USD'),'USD 0.01');assert.equal(displayMinorUnits(null,'HKD'),null);
});

const calls=[];let authorization=null,rpcError=null;
globalThis.financeTest={context:async(_req,capability,write)=>{calls.push({capability,write});return authorization??{client:{rpc:async(name,args)=>{calls.push({name,args});return{data:{items:[],totals:[]},error:rpcError};}}};}};
const compiled=await build({entryPoints:[new URL('../app/api/reconciliation/route.ts',import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:')],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'synthetic-auth-boundary',setup(builder){builder.onResolve({filter:/lib\/api\/server$/},()=>({path:'server',namespace:'synthetic'}));builder.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export const apiContext=(...args)=>globalThis.financeTest.context(...args);export const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});export const failure=(code,status)=>reply({ok:false,code},status);export const backendFailure=e=>failure(e.message==='forbidden'?'FORBIDDEN':'UNAVAILABLE',e.message==='forbidden'?403:503);export const boundedBody=async request=>request.json();`,loader:'ts'}));}}]});
const route=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const merchant='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
test('read transport rejects malformed filters and forwards scoped currency summaries through a session RPC',async()=>{
 calls.length=0;authorization=null;rpcError=null;
 for(const q of ['?other=x','?filter=[]','?filter='+encodeURIComponent(JSON.stringify({merchantId:'fake'})),'?filter='+encodeURIComponent(JSON.stringify({exceptionsOnly:'true'})),'?cursor={}'])assert.equal((await route.GET(new Request('https://example.test/api/reconciliation'+q))).status,400);
 assert.equal(calls.length,0);
 const filter={merchantId:merchant,exceptionsOnly:true};const response=await route.GET(new Request('https://example.test/api/reconciliation?filter='+encodeURIComponent(JSON.stringify(filter))));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(calls,[{capability:'merchant',write:undefined},{name:'get_kinnso_reconciliation',args:{p_filter:filter,p_cursor:null}}]);
 calls.length=0;rpcError={message:'forbidden'};assert.equal((await route.GET(new Request('https://example.test/api/reconciliation'))).status,403);assert.equal(calls[0].capability,'ops');
 authorization={response:Response.json({ok:false},{status:401})};calls.length=0;assert.equal((await route.GET(new Request('https://example.test/api/reconciliation'))).status,401);assert.equal(calls.length,1);
});
test('review transport never writes financial tables and preserves reason, source ID and replay request ID',async()=>{
 calls.length=0;authorization=null;rpcError=null;const command={type:'open',sourceKey:'settlement:'+merchant,reason:'Synthetic record needs investigation'};
 const request=payload=>new Request('https://example.test/api/reconciliation',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.test'},body:JSON.stringify(payload)});
 for(const payload of [{requestId,command:{...command,sourceKey:'arbitrary:'+merchant}},{requestId,command:{...command,reason:'short'}},{requestId,command:{...command,amount:100}},{requestId,command:{type:'review',id:merchant,expectedRevision:0,status:'closed',reason:command.reason}}])assert.equal((await route.POST(request(payload))).status,400);
 assert.equal(calls.length,0);assert.equal((await route.POST(request({requestId,command}))).status,200);
 assert.deepEqual(calls,[{capability:'merchant',write:true},{name:'apply_kinnso_reconciliation_review',args:{p_request_id:requestId,p_command:command}}]);
});
test('candidate migration preserves proof distinction, branch authority, aggregate scope and immutable operational history',()=>{
 const sql=readFileSync(new URL('../../../supabase/migrations/20261003220203_kinnso_financial_reconciliation_reads.sql',import.meta.url),'utf8');
 assert.match(sql,/merchant_role\(merchant,a,null,array\['owner','finance'\]\)/);
 assert.match(sql,/p_ops or p_owner or r\.kinnso_branch_id=any\(p_branches\)/);
 assert.match(sql,/group by currency,basis,state/);assert.match(sql,/from filtered group by/);
 assert.match(sql,/not exists\(select 1 from public\.mission_settlements s where nullif\(pg_catalog\.to_jsonb\(s\)->>'mission_milestone_submission_id',''\)::uuid=sub\.id\)/);
 assert.match(sql,/receipt_linkage_unknown/);
 assert.match(sql,/not_allocated_to_settlements/);assert.match(sql,/creator_payout_status='paid' then 'paid'/);
 assert.match(sql,/case_row\.revision is distinct from/);assert.match(sql,/immutable_history/);assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.doesNotMatch(sql,/update public\.(mission_settlements|creator_payout_batches|bookings)|insert into public\.(mission_settlements|creator_payout_batches|bookings)/);
 assert.doesNotMatch(sql,/coalesce\(.*currency.*'USD'/);
});
