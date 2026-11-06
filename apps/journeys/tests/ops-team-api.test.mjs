import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url),actor='00000000-0000-4000-8000-000000000001',member='11111111-1111-4111-8111-111111111111',invite='22222222-2222-4222-8222-222222222222',token='a'.repeat(64);
async function load(relative){const path=new URL(relative,import.meta.url);if(!existsSync(path))return{};const compiled=await build({entryPoints:[fileURLToPath(path)],bundle:true,write:false,platform:'node',format:'cjs',external:['next/server','next/headers'],plugins:[{name:'ops-team-session',setup(b){b.onResolve({filter:/supabase\/server$/},()=>({path:'session',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function serverClient(){return globalThis.__opsTeamClient}',loader:'js'}));}}]});const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports;}
const teamRoute=await load('../app/api/ops/team/route.ts'),acceptRoute=await load('../app/api/ops/invitations/accept/route.ts');
function setup(t,{roles=['ops'],owner=true,revoked=false,inviteResult={data:token,error:null},mutationError=null,pending=[],members=[]}={}){
 const env={KINNSO_SUPABASE_URL:'https://test.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://test.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://test.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_SITE_URL:'https://journeys.example',KINNSO_ENABLED_CAPABILITIES:'ops'};const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const state={queries:[],rpcCalls:[]};
 const query=table=>{const q={table,operation:'select',filters:[],orders:[],limit:null};state.queries.push(q);const builder={select(){return this;},eq(key,value){q.filters.push([key,value]);return this;},order(key,value){q.orders.push([key,value]);return this;},limit(value){q.limit=value;return this;},maybeSingle:async()=>({data:pending[0]??null,error:null}),then(resolve,reject){return Promise.resolve({data:table==='kinnso_ops_invites'?pending:members,error:null}).then(resolve,reject);}};return builder;};
 globalThis.__opsTeamClient={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async(name,args)=>{state.rpcCalls.push({name,args});if(name==='kinnso_actor')return{data:revoked?null:{id:actor,roles},error:revoked?{message:'unauthenticated'}:null};if(name==='is_active_ops_role')return{data:owner,error:null};if(name==='admin_list_ops_members')return{data:members,error:null};if(name==='admin_invite_ops_member')return inviteResult;if(name.startsWith('admin_'))return{data:null,error:mutationError};return{data:null,error:null};},from:query};
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
test('invite retries reconcile one pending email and member actions use the mature audited RPCs',async t=>{
 let state=setup(t);let response=await teamRoute.POST(request('/api/ops/team',{action:'invite',email:'analyst@example.test',role:'analyst'}));assert.equal(response.status,201);assert.equal((await response.json()).data.token,token);assert.deepEqual(state.rpcCalls.find(call=>call.name==='admin_invite_ops_member').args,{p_email:'analyst@example.test',p_role:'analyst'});
 state=setup(t,{inviteResult:{data:null,error:{code:'23505',message:'duplicate'}},pending:[{id:invite,email:'analyst@example.test',role:'analyst',status:'pending',token:token,created_at:'2026-11-06T00:00:00Z',expires_at:'2026-11-13T00:00:00Z'}]});response=await teamRoute.POST(request('/api/ops/team',{action:'invite',email:'analyst@example.test',role:'analyst'}));assert.equal(response.status,200);assert.equal((await response.json()).data.token,token);
 state=setup(t);response=await teamRoute.POST(request('/api/ops/team',{action:'setRole',memberId:member,role:'moderator',reason:'Temporary review coverage'}));assert.equal(response.status,200);assert.deepEqual(state.rpcCalls.find(call=>call.name==='admin_set_ops_member_role').args,{p_member_id:member,p_role:'moderator',p_reason:'Temporary review coverage'});
});
test('invite acceptance validates one-time tokens and maps expiry, mismatch and replay safely',async t=>{
 assert.equal(typeof acceptRoute.POST,'function');
 let state=setup(t);let response=await acceptRoute.POST(request('/api/ops/invitations/accept',{token}));assert.equal(response.status,200);assert.deepEqual(state.rpcCalls.find(call=>call.name==='admin_accept_ops_invite').args,{p_token:token});
 state=setup(t,{roles:['traveller']});response=await acceptRoute.POST(request('/api/ops/invitations/accept',{token}));assert.equal(response.status,200,'an invited non-ops actor must be able to accept the invitation');
 for(const bad of ['short','../token','A'.repeat(64),'a'.repeat(65)])assert.equal((await acceptRoute.POST(request('/api/ops/invitations/accept',{token:bad}))).status,400);
 for(const[message,status]of[['invite_expired',409],['invite_accepted',409],['invite_revoked',409],['email_mismatch',403],['not_found',404],[`private backend detail`,503]]){state=setup(t,{mutationError:{message,code:'XX000'}});response=await acceptRoute.POST(request('/api/ops/invitations/accept',{token}));assert.equal(response.status,status);assert.equal(JSON.stringify(await response.json()).includes('private backend'),false);}
});
