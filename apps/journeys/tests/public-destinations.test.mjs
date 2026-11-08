import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrationUrl} from './packaged-source.mjs';
import {readDestinationListing as listing,readPublicDestination as detail} from '../lib/seo/public-destinations.ts';
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const row={slug:'tokyo',name:'Tokyo',description:null,hero_image_url:'https://cdn.kinnso.ai/a.jpg',match_terms:['Tokyo','東京'],guide_count:'2',experience_count:0,latest_published_at:'2026-01-01T00:00:00Z'};
test('destination index uses anonymous ordered bounded pages with a lookahead',async()=>{
 const result=await listing(2,env,async(url,options)=>{const u=new URL(url);assert.equal(u.pathname,'/rest/v1/destination_index');assert.equal(u.searchParams.get('offset'),'12');assert.equal(u.searchParams.get('limit'),'13');assert.equal(u.searchParams.get('order'),'sort_order.asc,name.asc,slug.asc');assert.equal(options.headers.Authorization,undefined);assert.equal(options.cache,'no-store');return Response.json(Array.from({length:13},(_,i)=>({...row,slug:'city-'+i})));});
 assert.equal(result.items.length,12);assert.equal(result.hasNext,true);assert.equal(result.items[0].guideCount,2);
});
test('exact destination lookup decodes once and rejects unsafe identifiers before fetch',async()=>{
 const result=await detail('%E6%9D%B1%E4%BA%AC',env,async url=>{assert.equal(new URL(url).searchParams.get('slug'),'eq.東京');assert.equal(new URL(url).searchParams.get('limit'),'2');return Response.json([{...row,slug:'東京'}]);});assert.equal(result.slug,'東京');
 for(const slug of ['../private','%252Fsecret','%2Fprivate','%','a,b',''])assert.equal(await detail(slug,env,()=>assert.fail('must not fetch')),null);
});
test('destination unavailable, unknown and empty are distinct',async()=>{
 assert.equal(await detail('missing',env,async()=>Response.json([])),null);
 assert.deepEqual((await listing(1,env,async()=>Response.json([]))).items,[]);
 await assert.rejects(listing(1,env,async()=>Response.json({},{status:503})),/unavailable/);
 await assert.rejects(listing(1,{},async()=>assert.fail()),/unconfigured/);
});
test('destination projection rejects malformed counts, duplicates and identity mismatches',async()=>{
 for(const changes of [{guide_count:-1},{guide_count:'9007199254740993'},{name:''},{match_terms:[null]},{latest_published_at:'invalid'},{slug:'../private'}])await assert.rejects(listing(1,env,async()=>Response.json([{...row,...changes}])),/destination_schema/);
 await assert.rejects(listing(1,env,async()=>Response.json([row,row])),/destination_schema/);
 await assert.rejects(detail('osaka',env,async()=>Response.json([row])),/destination_schema/);
 await assert.rejects(detail('tokyo',env,async()=>Response.json([row,row])),/destination_schema/);
});
test('destination pages reject unbounded offsets and omit private fields and unsafe images',async()=>{
 for(const page of [0,-1,1.5,10001,NaN])await assert.rejects(listing(page,env,()=>assert.fail()),/destination_query/);
 const result=await listing(1,env,async()=>Response.json([{...row,hero_image_url:'https://outside.test/image',private:'DO_NOT_EXPOSE'}]));assert.equal(result.items[0].heroImageUrl,null);assert.ok(!JSON.stringify(result).includes('DO_NOT_EXPOSE'));
});

test('public destination policy excludes suspended source accounts from inventory counts',async()=>{
 const sql=await readFile(migrationUrl('20261106090000_kinnso_public_inventory_suspension.sql',import.meta.url),'utf8');
 assert.match(sql,/from public\.creators c[\s\S]*c\.status = 'active'[\s\S]*c\.public_profile is not null/i);
 assert.match(sql,/from public\.merchant_public_profiles m[\s\S]*m\.id = e\.merchant_profile_id/i);
});
