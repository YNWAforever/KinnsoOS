import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';


import {fixture,admin,anonymous} from './local-fixtures.mjs';
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
test('merchant team directory reads only owner-related members and rejects foreign company/cursor and revoked access',async()=>{
 const f=await fixture();const merchants=[];
 try{
  const owner=await f.actor(),otherOwner=await f.actor(),clerk=await f.actor(true),outsider=await f.actor(true),replacementOwner=await f.actor();
  for(const actor of [owner,otherOwner])merchants.push((await ok(admin.from('merchant_profiles').insert({user_id:actor.id,company_name:'Synthetic scoped team',contact_email:'synthetic@example.test'}).select('id').single())).id);
  const branch=randomUUID();const command=(merchantId,payload)=>ok((merchantId===merchants[0]?owner:otherOwner).client.rpc('apply_kinnso_merchant_command',{p_merchant_id:merchantId,p_request_id:randomUUID(),p_command:payload}));
  await command(merchants[0],{type:'createBranch',id:branch,name:'Assigned branch'});
  await command(merchants[0],{type:'setMember',userId:clerk.id,role:'clerk',branchIds:[branch],active:true});
  await command(merchants[1],{type:'setMember',userId:outsider.id,role:'finance',branchIds:[],active:true});
  const read=(actor,id=merchants[0],after=null)=>actor.client.rpc('get_kinnso_merchant_team',{p_merchant_id:id,p_after:after});
  const directory=await ok(read(owner));assert.equal(directory.members.length,1);assert.equal(directory.members[0].userId,clerk.id);assert.equal(directory.members[0].name,'Synthetic contract author');assert.deepEqual(directory.members[0].branchIds,[branch]);assert.equal(directory.nextCursor,null);
  assert.equal(JSON.stringify(directory).includes(outsider.id),false);assert.equal(JSON.stringify(directory).includes('synthetic-contract-'),false);
  assert.equal((await read(clerk)).error?.message,'forbidden');assert.equal((await read(outsider)).error?.message,'forbidden');assert.equal((await read(otherOwner)).error?.message,'forbidden');assert.ok((await anonymous.rpc('get_kinnso_merchant_team',{p_merchant_id:merchants[0]})).error);
  assert.equal((await read(owner,merchants[0],outsider.id)).error?.message,'invalid_cursor');
  await command(merchants[0],{type:'setMember',userId:clerk.id,role:'clerk',branchIds:[branch],active:false});assert.equal((await ok(read(owner))).members[0].active,false);
  await ok(admin.from('merchant_profiles').update({user_id:replacementOwner.id}).eq('id',merchants[0]));assert.equal((await read(owner)).error?.message,'forbidden');
 }finally{for(const id of merchants)await ok(admin.from('merchant_profiles').delete().eq('id',id));await f.cleanup();}
});

test('merchant team keyset pages all53 related members once and retains archived branch metadata explicitly',async()=>{
 const f=await fixture();let merchantId;const members=[];
 try{
  const owner=await f.actor();merchantId=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic paged team',contact_email:'synthetic@example.test'}).select('id').single())).id;
  const branch=randomUUID();const command=payload=>ok(owner.client.rpc('apply_kinnso_merchant_command',{p_merchant_id:merchantId,p_request_id:randomUUID(),p_command:payload}));await command({type:'createBranch',id:branch,name:'Synthetic retained branch'});
  for(let i=0;i<53;i++){const actor=await f.actor();members.push(actor.id);await command({type:'setMember',userId:actor.id,role:'clerk',branchIds:i===0?[branch]:[],active:i!==52});}
  const first=await ok(owner.client.rpc('get_kinnso_merchant_team',{p_merchant_id:merchantId}));assert.equal(first.members.length,50);assert.ok(first.nextCursor);const second=await ok(owner.client.rpc('get_kinnso_merchant_team',{p_merchant_id:merchantId,p_after:first.nextCursor}));assert.equal(second.members.length,3);assert.equal(second.nextCursor,null);assert.deepEqual([...first.members,...second.members].map(x=>x.userId).sort(),members.sort());
  const {execFileSync}=await import('node:child_process');execFileSync('docker',['exec','supabase_db_kinnsoos-b1-20261002','psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1','-c',`update kinnso_internal.merchant_branches set active=false where merchant_id='${merchantId}' and id='${branch}';`]);
  const updated=await ok(owner.client.rpc('get_kinnso_merchant_team',{p_merchant_id:merchantId}));const row=updated.members.find(x=>x.branchIds.includes(branch))??(await ok(owner.client.rpc('get_kinnso_merchant_team',{p_merchant_id:merchantId,p_after:updated.nextCursor}))).members.find(x=>x.branchIds.includes(branch));assert.equal(row.branches[0].name,'Synthetic retained branch');assert.equal(row.branches[0].active,false);assert.deepEqual(row.branchIds,[branch]);
 }finally{if(merchantId)await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));await f.cleanup();}
});
