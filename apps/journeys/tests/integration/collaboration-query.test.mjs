import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fixture,admin} from './local-fixtures.mjs';
const ok=async p=>{const r=await p;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};
async function setup(){const f=await fixture(),owner=await f.actor(),creator=await f.actor(true),foreign=await f.actor(true);const merchant=(await ok(admin.from('merchant_profiles').insert({user_id:owner.id,company_name:'Synthetic query company',contact_email:'synthetic@example.test'}).select('id').single())).id;const prefix='Synthetic list '+randomUUID();const ids=Array.from({length:55},()=>randomUUID()).sort();
 await ok(admin.from('missions').insert(ids.map(id=>({id,merchant_profile_id:merchant,title:prefix+' '+id,summary:'Literal %_ searchable text',mission_source:'merchant',mission_type:'coupon_affiliate',status:'draft',created_at:'2026-01-01T00:00:00.123456Z'}))));
 await ok(admin.from('mission_milestones').insert(ids.map((id,i)=>({mission_id:id,title:'Synthetic due work',description:'Owned fixture',sort_order:0,due_at:i<50?'2030-01-01T00:00:00Z':null}))));await ok(admin.from('missions').update({status:'published'}).in('id',ids));
 await ok(admin.from('mission_participants').insert(ids.map(id=>({mission_id:id,creator_id:creator.id,status:'active',source:'open_join'}))));
 const read=(scope,query={},actor=scope==='merchant'?owner:creator)=>actor.client.rpc(scope==='merchant'?'query_kinnso_merchant_campaigns':'query_kinnso_creator_missions',scope==='merchant'?{p_merchant_id:merchant,p_query:query}:{p_scope:scope,p_query:query});return{f,owner,creator,foreign,merchant,prefix,ids,read,cleanup:async()=>{await ok(admin.from('merchant_profiles').delete().eq('id',merchant));await f.cleanup();}};
}
test('both role lists keyset all 55 equal-created records exactly once with company totals kept separate',async()=>{const x=await setup();try{
 for(const scope of ['merchant','mine']){const found=[];let after;do{const page=await ok(x.read(scope,{q:x.prefix,sort:'recent',...after?{after}:{}}));assert.ok(page.items.length<=20);found.push(...page.items.map(i=>i.id));after=page.nextCursor;}while(after);assert.equal(new Set(found).size,55);assert.deepEqual(found,[...x.ids].reverse());}
 assert.equal((await ok(x.read('merchant',{q:'unmatched'}))).summary.published,55);assert.equal((await ok(x.read('mine',{q:'%_'}))).items.length,20);
}finally{await x.cleanup();}});
test('cursor binds actor company filter order and current scope; deadline sorting puts missing dates last',async()=>{const x=await setup();try{
 const first=await ok(x.read('mine',{q:x.prefix,sort:'deadline'}));assert.deepEqual(first.items.map(i=>i.id),x.ids.slice(0,20));
 for(const query of [{q:'other',sort:'deadline'},{q:x.prefix,sort:'recent'},{q:x.prefix,sort:'deadline',status:'completed'}])assert.equal((await x.read('mine',{...query,after:first.nextCursor})).error?.message,'invalid_cursor');
 assert.equal((await x.read('mine',{q:x.prefix,sort:'deadline',after:first.nextCursor},x.foreign)).error?.message,'invalid_cursor');
 const m=await ok(x.read('merchant',{q:x.prefix}));assert.equal((await x.read('merchant',{q:x.prefix,after:m.nextCursor},x.foreign)).error?.message,'forbidden');
 await ok(admin.from('mission_participants').update({status:'completed'}).eq('mission_id',first.items.at(-1).id).eq('creator_id',x.creator.id));assert.equal((await x.read('mine',{q:x.prefix,sort:'deadline',after:first.nextCursor})).error?.message,'invalid_cursor');
 await ok(admin.from('creators').update({status:'suspended'}).eq('id',x.creator.id));assert.equal((await x.read('mine',{q:x.prefix})).error?.message,'creator_required');assert.equal((await ok(x.read('merchant',{q:x.prefix}))).items.length,20);
}finally{await x.cleanup();}});
test('recent ordering survives concurrent updates and newer inserts; authenticated createdAt rewrites are denied',async()=>{const x=await setup();try{
 const first=await ok(x.read('merchant',{q:x.prefix}));const target=first.items.at(-1).id;
 assert.equal((await x.owner.client.from('missions').update({created_at:'2031-01-01T00:00:00Z'}).eq('id',target)).error?.message,'immutable_campaign_created_at');
 await ok(admin.from('missions').update({status:'paused'}).eq('id',x.ids[0]));await ok(admin.from('missions').insert({merchant_profile_id:x.merchant,title:x.prefix+' new',mission_source:'merchant',mission_type:'coupon_affiliate',status:'draft',created_at:'2031-01-01T00:00:00Z'}));
 const second=await ok(x.read('merchant',{q:x.prefix,after:first.nextCursor}));assert.equal(second.items.some(i=>first.items.some(j=>j.id===i.id)),false);assert.deepEqual(second.items.map(i=>i.id),[...x.ids].reverse().slice(20,40));
}finally{await x.cleanup();}});
