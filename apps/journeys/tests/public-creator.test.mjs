import test from 'node:test';
import assert from 'node:assert/strict';
const subject=await import('../lib/seo/public-creator.ts');
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const id='e1c2820d-25e5-9795-54b5-637be546e04a';
const row={id,handle:'real-creator',display_name:'Public name',bio:'Public bio',privateDna:'NEVER'};
test('creator reads bind handle, public projection and bounded published guides without actor credentials',async()=>{
 assert.equal(typeof subject.readPublicCreator,'function');let calls=0;
 const dto=await subject.readPublicCreator('real-creator',env,async(input,options)=>{
  const url=new URL(input);assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
  assert.deepEqual(options.headers,{apikey:env.KINNSO_SUPABASE_PUBLISHABLE_KEY});assert.equal(url.searchParams.get('limit'),calls===0?'1':'7');
  if(calls++===0){assert.equal(url.pathname,'/rest/v1/creators');assert.equal(url.searchParams.get('handle'),'eq.real-creator');assert.equal(url.searchParams.get('status'),'eq.active');assert.equal(url.searchParams.get('public_profile'),'not.is.null');assert.equal(url.searchParams.get('select'),'id,handle,display_name,bio');return Response.json([row]);}
  assert.equal(url.pathname,'/rest/v1/guides');assert.equal(url.searchParams.get('creator_id'),'eq.'+id);assert.equal(url.searchParams.get('status'),'eq.published');assert.equal(url.searchParams.get('select'),'id,title');assert.equal(url.searchParams.get('order'),'published_at.desc.nullslast,id.asc');return Response.json([{id,title:'Real published guide',travellerNote:'NEVER'}]);
 });
 assert.equal(calls,2);assert.deepEqual(dto,{id,handle:'real-creator',name:'Public name',bio:'Public bio',guides:[{id,title:'Real published guide'}],hasMore:false});assert.ok(!JSON.stringify(dto).includes('NEVER'));
});
test('absent, invalid and private creators never fall back to demo or owner projections',async()=>{
 assert.equal(typeof subject.readPublicCreator,'function');let calls=0;
 for(const handle of [null,undefined,'../private','a/b','a?token=x','', 'x'.repeat(81)])assert.equal(await subject.readPublicCreator(handle,env,async()=>{calls++;throw Error('must not fetch')}),null);
 assert.equal(calls,0);assert.equal(await subject.readPublicCreator('real-creator',env,async()=>Response.json([])),null);
 await assert.rejects(subject.readPublicCreator('real-creator',{},async()=>{calls++;throw Error('must not fetch')}),/creator_unconfigured/);assert.equal(calls,0);
 await assert.rejects(subject.readPublicCreator('real-creator',env,async()=>Response.json([row],{status:403})),/creator_unavailable/);
});
test('wrong identity, oversized result and malformed guide projection fail closed; one extra guide only indicates continuation',async()=>{
 assert.equal(typeof subject.readPublicCreator,'function');
 for(const rows of [[{...row,handle:'other'}],[row,row],[{...row,id:'invalid'}]])await assert.rejects(subject.readPublicCreator('real-creator',env,async()=>Response.json(rows)),/creator_schema/);
 const guides=Array.from({length:7},(_,i)=>({id:'00000000-0000-0000-0000-'+String(i).padStart(12,'0'),title:'Published '+i}));
 for(const rows of [[{id:'bad',title:'Title'}], [...guides,guides[0]]]){let calls=0;await assert.rejects(subject.readPublicCreator('real-creator',env,async()=>Response.json(calls++?rows:[row])),/creator_schema/);}
 let calls=0;const dto=await subject.readPublicCreator('real-creator',env,async()=>Response.json(calls++?guides:[{...row,display_name:null,bio:null}]));
 assert.equal(dto.guides.length,6);assert.equal(dto.hasMore,true);assert.equal(dto.name,'real-creator');assert.equal(dto.bio,'');assert.equal('guideCount' in dto,false);
});
test('creator metadata retains the actual legacy locale URL without inventing authored translations or dates',()=>{
 assert.equal(typeof subject.creatorPageMetadata,'function');
 const meta=subject.creatorPageMetadata({id,handle:row.handle,name:row.display_name,bio:row.bio,guides:[],hasMore:false},'zh-HK');
 assert.equal(meta.title,row.display_name);assert.equal(meta.description,row.bio);assert.equal(meta.alternates.canonical,'https://remix-kinnso-web.vercel.app/zh-hk/c/real-creator');assert.equal(meta.alternates.languages,undefined);
 assert.deepEqual(meta.robots,{index:false,follow:false});assert.equal(meta.openGraph.type,'profile');assert.equal(meta.openGraph.url,meta.alternates.canonical);assert.equal(meta.openGraph.modifiedTime,undefined);assert.equal(meta.openGraph.publishedTime,undefined);
 assert.throws(()=>subject.creatorPageMetadata({...row,name:'Public',bio:''},'ja'),/creator_locale/);
});
