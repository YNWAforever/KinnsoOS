import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url),actor='00000000-0000-4000-8000-000000000001',member='11111111-1111-4111-8111-111111111111',invite='22222222-2222-4222-8222-222222222222',token='a'.repeat(64);
async function load(relative){const path=new URL(relative,import.meta.url);if(!existsSync(path))return{};const compiled=await build({entryPoints:[fileURLToPath(path)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'ops-team-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__opsTeamClient}',loader:'js'}));}}]});const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports;}
const teamRoute=await load('../app/api/ops/team/route.ts'),acceptRoute=await load('../app/api/ops/invitations/accept/route.ts');
function setup(t,{roles=['ops'],owner=true,revoked=false,inviteResult={data:token,error:null},mutationError=null,teamMutation,pending=[],members=[]}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'ops'};const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const state={queries:[],rpcCalls:[]};
 const query=table=>{const q={table,operation:'select',filters:[],orders:[],limit:null};state.queries.push(q);const builder={select(){return this;},eq(key,value){q.filters.push([key,value]);return this;},order(key,value){q.orders.push([key,value]);return this;},limit(value){q.limit=value;return this;},maybeSingle:async()=>({data:pending[0]??null,error:null}),then(resolve,reject){return Promise.resolve({data:table==='kinnso_ops_invites'?pending:members,error:null}).then(resolve,reject);}};return builder;};
 globalThis.__opsTeamClient={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async(name,args)=>{state.rpcCalls.push({name,args});if(name==='kinnso_actor')return{data:revoked?null:{id:actor,roles},error:revoked?{message:'unauthenticated'}:null};if(name==='is_active_ops_role')return{data:owner,error:null};if(name==='admin_list_ops_members')return{data:members,error:null};if(name==='mutate_kinnso_ops_team')return teamMutation?teamMutation(args):mutationError?{data:null,error:mutationError}:args.p_action==='invite'?{...inviteResult,data:inviteResult.data?{token:inviteResult.data}:null}:{data:{id:args.p_target},error:null};if(name.startsWith('admin_'))return{data:null,error:mutationError};return{data:null,error:null};},from:query};
 t.after(()=>{delete globalThis.__opsTeamClient;for(const[key,value]of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;});return state;
}
const request=(path,body,origin='https://journeys.example')=>new Request('https://journeys.example'+path,{method:body===undefined?'GET':'POST',headers:{host:'journeys.example',origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
test('team BFF requires fresh operations access and returns owner controls without invite tokens',async t=>{
 assert.equal(typeof teamRoute.GET,'function');
 let state=setup(t,{roles:['creator']});assert.equal((await teamRoute.GET(request('/api/ops/team'))).status,403);assert.equal(state.queries.length,0);
 state=setup(t,{revoked:true});assert.equal((await teamRoute.GET(request('/api/ops/team'))).status,401);
 const pending=[{id:invite,email:'invite@example.test',role:'analyst',status:'pending',created_at:'2026-11-06T00:00:00Z',expires_at:'2026-11-13T00:00:00Z',token:'DO_NOT_EXPOSE'}];
 const members=[{id:member,display_name:'Owner',user_id:actor,role:'owner',status:'active',joined_at:'2026-11-01T00:00:00Z'}];
 state=setup(t,{pending,members});const response=await teamRoute.GET(request('/api/ops/team'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.canManage,true);assert.equal(body.data.pendingInvites.length,1);assert.equal(JSON.stringify(body).includes('DO_NOT_EXPOSE'),false);assert.equal(state.queries[0].limit,25);
});
test('owner-only team mutations reject foreign origin, malformed input and non-owner roles before writes',async t=>{
 assert.equal(typeof teamRoute.POST,'function');
 let state=setup(t,{roles:['ops'],owner:false});assert.equal((await teamRoute.POST(request('/api/ops/team',{action:'invite',email:'analyst@example.test',role:'analyst'}))).status,403);assert.equal(state.rpcCalls.some(call=>call.name==='admin_invite_ops_member'),false);
 state=setup(t);assert.equal((await teamRoute.POST(request('/api/ops/team',{action:'invite',email:'analyst@example.test',role:'analyst'},'https://foreign.test'))).status,403);
 for(const body of [{action:'invite',email:'bad',role:'analyst'},{action:'setRole',memberId:member,role:'creator',reason:'Invalid'},{action:'suspend',memberId:'bad',reason:'Review'},{action:'unknown'}])assert.equal((await teamRoute.POST(request('/api/ops/team',body))).status,400);
});
test('team mutations require an operation ID and dispatch canonical commands',async t=>{
 const state=setup(t);
 const post=body=>teamRoute.POST(request('/api/ops/team',body));
 const command={action:'invite',email:' Analyst@EXAMPLE.test ',role:'analyst'};
 for(const requestId of [undefined,'bad'])assert.equal((await post({...command,requestId})).status,400);
 assert.equal(state.rpcCalls.some(call=>call.name==='mutate_kinnso_ops_team'),false);
 const response=await post({...command,requestId:actor});
 assert.equal(response.status,201);
 assert.deepEqual((await response.json()).data,{token});
 assert.deepEqual(state.rpcCalls.at(-1),{name:'mutate_kinnso_ops_team',args:{p_request_id:actor,p_action:'invite',p_email:'analyst@example.test',p_role:'analyst'}});
});

for(const [command,result] of [
 [{action:'revoke',inviteId:invite},{id:invite,status:'revoked'}],
 [{action:'setRole',memberId:member,role:'moderator',reason:' Review '},{id:member,role:'moderator'}],
]){
 test(command.action+' recovers a committed response using the same canonical operation',async t=>{
  const receipts=new Map();let writes=0;
  const state=setup(t,{teamMutation:args=>{
   const key=args.p_request_id, signature=JSON.stringify(args), prior=receipts.get(key);
   if(prior)return prior===signature?{data:result,error:null}:{data:null,error:{message:'REQUEST_ID_REUSED'}};
   receipts.set(key,signature);writes++;
   if(writes===1)throw Error('response lost after commit');
   return {data:result,error:null};
  }});
  const post=body=>teamRoute.POST(request('/api/ops/team',body));
  const input={...command,requestId:actor};
  assert.equal((await post(input)).status,503);
  const response=await post(input);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).data,result);
  const calls=state.rpcCalls.filter(call=>call.name==='mutate_kinnso_ops_team');
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  assert.equal(calls[0].args.p_request_id,actor);
  assert.equal(calls[0].args.p_target,command.inviteId??command.memberId);
  if(command.reason)assert.equal(calls[0].args.p_reason,'Review');
  const conflict=await post({...input,...(command.inviteId?{inviteId:member}:{reason:'Changed'})});
  assert.equal(conflict.status,409);assert.equal((await conflict.json()).retryable,false);assert.equal(writes,1);
 });
}

test('invite acceptance validates one-time tokens and maps expiry, mismatch and replay safely',async t=>{
 assert.equal(typeof acceptRoute.POST,'function');
 let state=setup(t);let response=await acceptRoute.POST(request('/api/ops/invitations/accept',{token}));assert.equal(response.status,200);assert.deepEqual(state.rpcCalls.find(call=>call.name==='admin_accept_ops_invite').args,{p_token:token});
 state=setup(t,{roles:['traveller']});response=await acceptRoute.POST(request('/api/ops/invitations/accept',{token}));assert.equal(response.status,200,'an invited non-ops actor must be able to accept the invitation');
 for(const bad of ['short','../token','A'.repeat(64),'a'.repeat(65)])assert.equal((await acceptRoute.POST(request('/api/ops/invitations/accept',{token:bad}))).status,400);
 for(const[message,status]of[['invite_expired',409],['invite_accepted',409],['invite_revoked',409],['already_ops_member',409],['email_mismatch',403],['email_unverified',403],['not_found',404],[`private backend detail`,503]]){state=setup(t,{mutationError:{message,code:'XX000'}});response=await acceptRoute.POST(request('/api/ops/invitations/accept',{token}));assert.equal(response.status,status);assert.equal(JSON.stringify(await response.json()).includes('private backend'),false);}
});
