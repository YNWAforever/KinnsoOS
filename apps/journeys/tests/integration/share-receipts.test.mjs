// This suite creates/cleans only actors on the fresh owned GitHub Actions stack.
import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';
import {newShareToken,recoverShareToken} from '../../lib/trips/share-receipt-crypto.ts';
const target=verifyTestTarget();
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||target.projectRef!=='kinnsoos-b1-20261002')throw Error('BLOCKED: durable-share SQL cases require the fresh owned CI stack, never pilot/shared targets');
const inspect=name=>JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
const db=inspect(target.dbContainer),gateway=inspect('supabase_kong_'+target.projectRef);
for(const c of [db,gateway]){assert.equal(c.Config.Labels['com.supabase.cli.project'],target.projectRef);assert.equal(c.State.Running,true);}
assert.ok((gateway.NetworkSettings.Ports['8000/tcp']??[]).some(p=>p.HostPort==='58421'));
assert.ok(Object.values(db.NetworkSettings.Networks).some(n=>Object.values(gateway.NetworkSettings.Networks).some(g=>g.NetworkID===n.NetworkID)));
// Dynamic import happens only after the label/network/port identity checks above.
const {fixture,anonymous}=await import('./local-fixtures.mjs');
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
const sql=q=>execFileSync('docker',['exec',target.dbContainer,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let cleanupBlocked=false;
async function setup({duration=60,observed=[]}={}){
 if(cleanupBlocked)throw Error('BLOCKED: prior owned share fixture cleanup failed');
 const f=await fixture(),actors=[];
 async function cleanup(){try{await f.cleanup();if(!actors.length)return;const ids=actors.map(x=>`'${x}'`).join(',');assert.equal(sql(`select count(*) from kinnso_internal.trip_share_receipts where owner_id in (${ids});`),'0');assert.equal(sql(`select count(*) from kinnso_internal.trip_shares where owner_id in (${ids});`),'0');}catch(error){cleanupBlocked=true;throw error;}}
 try{
 const a=await f.actor();actors.push(a.id);observed.push(a.id);const b=await f.actor();actors.push(b.id);observed.push(b.id);
 const trip=await ok(a.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic receipt trip',timezone:'Asia/Hong_Kong',startDate:null}}));
 const day=randomUUID(),stop=randomUUID();let current=await ok(a.client.rpc('apply_trip_command',{p_trip_id:trip.id,p_expected_revision:trip.revision,p_request_id:randomUUID(),p_command:{type:'addDay',id:day,offset:0,title:'Synthetic day'}}));
 current=await ok(a.client.rpc('apply_trip_command',{p_trip_id:trip.id,p_expected_revision:current.revision,p_request_id:randomUUID(),p_command:{type:'addStop',id:stop,dayId:day,position:0,input:{title:'Selected public title',placeId:null,travellerNote:'PRIVATE_RECEIPT_NOTE',startMinuteOfDay:0,durationMinutes:duration}}}));
 const intent={requestId:randomUUID(),tripId:trip.id,stopIds:[stop],mediaIds:[],expiresAt:new Date(Date.now()+300000).toISOString()};
 const args=(command=intent)=>{const x=newShareToken({actorId:a.id,tripId:command.tripId,requestId:command.requestId});return{p_request_id:command.requestId,p_trip_id:command.tripId,p_stop_ids:command.stopIds,p_media_ids:command.mediaIds,p_expires_at:command.expiresAt,p_token_hash:x.tokenHash,p_envelope:x.envelope};};
 const read=(who=a,command=intent)=>who.client.rpc('get_trip_share_receipt',{p_trip_id:command.tripId,p_request_id:command.requestId});
 const counts=()=>JSON.parse(sql(`select json_build_object('shares',(select count(*) from kinnso_internal.trip_shares where owner_id='${a.id}'),'receipts',(select count(*) from kinnso_internal.trip_share_receipts where owner_id='${a.id}'));`));

 return {f,a,b,trip:current,intent,args,read,counts,cleanup,stop};
 }catch(error){try{await cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Owned share setup and cleanup failed');}throw error;}
}
test('concurrent same-intent share creation commits one immutable receipt/token and excludes private notes',async()=>{const x=await setup();try{
 const results=await Promise.all(Array.from({length:6},()=>x.a.client.rpc('create_trip_share_v2',x.args()))),first=await ok(Promise.resolve(results[0]));
 for(const r of results)assert.deepEqual(await ok(Promise.resolve(r)),first);assert.deepEqual(x.counts(),{shares:1,receipts:1});
 const token=recoverShareToken(first.envelope,{actorId:x.a.id,tripId:x.intent.tripId,requestId:x.intent.requestId});const publicTrip=await ok(anonymous.rpc('get_shared_trip',{p_token:token}));
 assert.equal(publicTrip.days[0].stops[0].title,'Selected public title');assert.equal(JSON.stringify(publicTrip).includes('PRIVATE_RECEIPT_NOTE'),false);assert.equal(JSON.stringify(first).includes(token),false);
 assert.deepEqual(await ok(x.read()),first);
}finally{await x.cleanup();}});
test('same key changed intent conflicts, another actor cannot read/mint/revoke the owner receipt',async()=>{const x=await setup();try{
 const first=await ok(x.a.client.rpc('create_trip_share_v2',x.args()));for(const command of [{...x.intent,stopIds:[]},{...x.intent,expiresAt:new Date(Date.now()+200000).toISOString()}])assert.equal((await x.a.client.rpc('create_trip_share_v2',x.args(command))).error?.message,'idempotency_conflict');
 assert.match((await x.read(x.b)).error?.message??'',/trip_not_found/);assert.ok((await anonymous.rpc('get_trip_share_receipt',{p_trip_id:x.trip.id,p_request_id:x.intent.requestId})).error);
 assert.match((await x.b.client.rpc('create_trip_share_v2',x.args())).error?.message??'',/trip_not_found/);assert.match((await x.b.client.rpc('revoke_trip_share',{p_share_id:first.id})).error?.message??'',/share_not_found/);
 assert.equal(await ok(x.read(x.a,{...x.intent,requestId:randomUUID()})),null);assert.deepEqual(x.counts(),{shares:1,receipts:1});
}finally{await x.cleanup();}});
test('receipt replay precedes changed trip revision/removed selections and does not rebuild the projection',async()=>{const x=await setup();try{
 const first=await ok(x.a.client.rpc('create_trip_share_v2',x.args()));await ok(x.a.client.rpc('apply_trip_command',{p_trip_id:x.trip.id,p_expected_revision:x.trip.revision,p_request_id:randomUUID(),p_command:{type:'removeStop',id:x.stop}}));
 const replay=await ok(x.a.client.rpc('create_trip_share_v2',x.args()));assert.deepEqual(replay,first);assert.equal(replay.projection.days[0].stops[0].title,'Selected public title');assert.deepEqual(x.counts(),{shares:1,receipts:1});
}finally{await x.cleanup();}});
test('revoked and naturally expired receipts are terminal, never resurrect the original token',async()=>{const x=await setup();try{
 const first=await ok(x.a.client.rpc('create_trip_share_v2',x.args())),token=recoverShareToken(first.envelope,{actorId:x.a.id,tripId:x.intent.tripId,requestId:x.intent.requestId});await ok(x.a.client.rpc('revoke_trip_share',{p_share_id:first.id}));
 const revoked=await ok(x.a.client.rpc('create_trip_share_v2',x.args()));assert.equal(revoked.id,first.id);assert.equal(revoked.state,'revoked');assert.equal(revoked.envelope,null);assert.ok((await anonymous.rpc('get_shared_trip',{p_token:token})).error);
 const short={...x.intent,requestId:randomUUID(),expiresAt:new Date(Date.now()+1800).toISOString()};const live=await ok(x.a.client.rpc('create_trip_share_v2',x.args(short))),oldToken=recoverShareToken(live.envelope,{actorId:x.a.id,tripId:x.intent.tripId,requestId:short.requestId});
 await new Promise(resolve=>setTimeout(resolve,1900));const expired=await ok(x.a.client.rpc('create_trip_share_v2',x.args(short)));assert.equal(expired.id,live.id);assert.equal(expired.state,'expired');assert.equal(expired.envelope,null);assert.ok((await anonymous.rpc('get_shared_trip',{p_token:oldToken})).error);
 assert.deepEqual(x.counts(),{shares:2,receipts:2});
}finally{await x.cleanup();}});
test('receipt keyset covers21 rows once with explicit cursor and no token/intent/projection in metadata',async()=>{const x=await setup();try{
 const ids=[];for(let n=0;n<21;n++){const c={...x.intent,requestId:randomUUID()},r=await ok(x.a.client.rpc('create_trip_share_v2',x.args(c)));ids.push(r.id);await ok(x.a.client.rpc('revoke_trip_share',{p_share_id:r.id}));}
 const first=await ok(x.a.client.rpc('list_trip_share_receipts',{p_trip_id:x.trip.id}));assert.equal(first.items.length,20);assert.deepEqual(first.nextCursor,{createdAt:first.items[19].createdAt,requestId:first.items[19].requestId});
 const next=await ok(x.a.client.rpc('list_trip_share_receipts',{p_trip_id:x.trip.id,p_before:first.nextCursor.createdAt,p_before_request:first.nextCursor.requestId}));assert.equal(next.items.length,1);assert.equal(next.nextCursor,null);assert.deepEqual(new Set([...first.items,...next.items].map(r=>r.id)),new Set(ids));
 for(const r of [...first.items,...next.items])assert.deepEqual(Object.keys(r).sort(),['createdAt','expiresAt','id','requestId','state'].sort());assert.equal((await x.a.client.rpc('list_trip_share_receipts',{p_trip_id:x.trip.id,p_before:new Date().toISOString()})).error?.message,'invalid_cursor');
}finally{await x.cleanup();}});
test('actor quota serializes concurrent v2 writes across different trips',async()=>{const x=await setup();try{
 for(let n=0;n<9;n++)await ok(x.a.client.rpc('create_trip_share_v2',x.args({...x.intent,requestId:randomUUID()})));
 const other=await ok(x.a.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic second receipt trip',timezone:'UTC',startDate:null}}));
 const results=await Promise.all([x.a.client.rpc('create_trip_share_v2',x.args({...x.intent,requestId:randomUUID()})),x.a.client.rpc('create_trip_share_v2',x.args({...x.intent,requestId:randomUUID(),tripId:other.id,stopIds:[]}))]);assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.find(r=>r.error).error.message,'invalid_share_quota');assert.deepEqual(x.counts(),{shares:10,receipts:10});
}finally{await x.cleanup();}});
test('legacy and v2 writers share one actor quota without changing the legacy public projection',async()=>{const x=await setup();try{
 for(let n=0;n<9;n++)await ok(x.a.client.rpc('create_trip_share_v2',x.args({...x.intent,requestId:randomUUID()})));
 const other=await ok(x.a.client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic legacy quota',timezone:'UTC',startDate:null}}));
 const results=await Promise.all([x.a.client.rpc('create_trip_share_v2',x.args({...x.intent,requestId:randomUUID()})),x.a.client.rpc('create_trip_share',{p_trip_id:other.id,p_stop_ids:[],p_media_ids:[],p_expires_at:x.intent.expiresAt})]);assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.find(r=>r.error).error.message,'invalid_share_quota');assert.equal(x.counts().shares,10);
}finally{await x.cleanup();}});
test('private receipt ACLs, immutable result and invoker-only public wrappers fail closed',async()=>{const x=await setup();try{
 await ok(x.a.client.rpc('create_trip_share_v2',x.args()));
 const a=JSON.parse(sql(`select json_build_object('rls',(select relrowsecurity from pg_class where oid='kinnso_internal.trip_share_receipts'::regclass),'definers',(select count(*) from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname in ('create_trip_share_v2','get_trip_share_receipt','list_trip_share_receipts') and p.prosecdef),'tableGrants',(select count(*) from (values ('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(role,'kinnso_internal.trip_share_receipts','SELECT,INSERT,UPDATE,DELETE')),'anonExec',has_function_privilege('anon','public.get_trip_share_receipt(uuid,uuid)','EXECUTE'));`));assert.deepEqual(a,{rls:true,definers:0,tableGrants:0,anonExec:false});
 assert.throws(()=>sql(`update kinnso_internal.trip_share_receipts set intent='{}' where owner_id='${x.a.id}';`),/immutable_share_receipt/);
 const malformed=x.args({...x.intent,requestId:randomUUID()});malformed.p_envelope={v:1};assert.equal((await x.a.client.rpc('create_trip_share_v2',malformed)).error?.message,'invalid_share_envelope');assert.deepEqual(x.counts(),{shares:1,receipts:1});
 assert.throws(()=>sql(`set role authenticated;select kinnso_share_api.receipt('${x.a.id}','${x.trip.id}','${x.intent.requestId}');`),/permission denied/);
}finally{await x.cleanup();}});
test('receipt insert failure rolls back the share atomically; same intent can subsequently commit once',async()=>{const x=await setup();const name='ci_share_abort_'+randomUUID().replaceAll('-','');let installed=false;try{
 sql(`create function kinnso_internal.${name}() returns trigger language plpgsql set search_path='' as $$begin if new.owner_id='${x.a.id}'::uuid then raise exception 'fixture_receipt_abort';end if;return new;end $$;create trigger ${name} before insert on kinnso_internal.trip_share_receipts for each row execute function kinnso_internal.${name}();`);installed=true;
 assert.match((await x.a.client.rpc('create_trip_share_v2',x.args())).error?.message??'',/fixture_receipt_abort/);assert.deepEqual(x.counts(),{shares:0,receipts:0});
 sql(`drop trigger ${name} on kinnso_internal.trip_share_receipts;drop function kinnso_internal.${name}();`);installed=false;await ok(x.a.client.rpc('create_trip_share_v2',x.args()));assert.deepEqual(x.counts(),{shares:1,receipts:1});
}finally{if(installed)sql(`drop trigger ${name} on kinnso_internal.trip_share_receipts;drop function kinnso_internal.${name}();`);await x.cleanup();}});
test('stale canonical auth session cannot recover an owner receipt even with its still-signed JWT',async()=>{const x=await setup();try{
 await ok(x.a.client.rpc('create_trip_share_v2',x.args()));sql(`delete from auth.sessions where user_id='${x.a.id}';`);assert.match((await x.read()).error?.message??'',/unauthenticated/);assert.match((await x.a.client.rpc('create_trip_share_v2',x.args())).error?.message??'',/unauthenticated/);
}finally{await x.cleanup();}});

test('partial owned fixture setup failure cleans exact actors and trips before propagating the original error',async()=>{const observed=[];await assert.rejects(()=>setup({duration:0,observed}),/trip_stops_duration_minutes_check/);assert.equal(observed.length,2);const ids=observed.map(id=>`'${id}'`).join(',');assert.equal(sql(`select count(*) from auth.users where id in (${ids});`),'0');assert.equal(sql(`select count(*) from public.trips where owner_user_id in (${ids});`),'0');assert.equal(sql(`select count(*) from kinnso_internal.trip_share_receipts where owner_id in (${ids});`),'0');});
