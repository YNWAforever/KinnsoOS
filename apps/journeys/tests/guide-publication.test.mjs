import {test} from 'node:test';
import assert from 'node:assert/strict';
const page = await import('../lib/seo/guide-publication.ts').catch(() => ({}));
const id='11111111-1111-4111-8111-111111111111';
const guide={kind:'summary',id,title:'Published title',summary:'Authored summary',destinationId:null};
const row={id,title:guide.title,creator_name:'Published author',published_at:'2026-09-01T10:00:00Z',cover_url:'https://cdn.kinnso.ai/published-cover.jpg'};
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};

test('publication projects only known public fields and binds guide identity and title',()=>{
 assert.equal(typeof page.publication,'function');
 assert.deepEqual(page.publication(guide,{...row,privateNote:'hidden',email:'private@example.test'}),{author:'Published author',publishedAt:row.published_at,coverUrl:row.cover_url});
 assert.throws(()=>page.publication(guide,{...row,id:'22222222-2222-4222-8222-222222222222'}),/guide_schema/);
 assert.throws(()=>page.publication(guide,{...row,title:'A different current publication'}),/guide_schema/);
});
test('missing author/date/image stay absent and malformed dates remain schema errors',()=>{
 assert.equal(typeof page.publication,'function');
 assert.deepEqual(page.publication(guide,{...row,creator_name:null,published_at:null,cover_url:null}),{author:null,publishedAt:null,coverUrl:null});
 assert.throws(()=>page.publication(guide,{...row,published_at:'not a date'}),/guide_schema/);
});
test('covers accept the existing public CDN only, without credentials, ports or signed query tokens',()=>{
 assert.equal(typeof page.publication,'function');
 for(const cover_url of ['https://unapproved.test/image.jpg','http://cdn.kinnso.ai/image.jpg','https://user@cdn.kinnso.ai/image.jpg','https://cdn.kinnso.ai:8443/image.jpg','https://cdn.kinnso.ai/image.jpg?token=private','https://cdn.kinnso.ai/image.jpg#private','javascript:alert(1)'])
  assert.equal(page.publication(guide,{...row,cover_url}).coverUrl,null);
});
test('page read uses the public key with exact published-ID filtering and a bounded projection',async()=>{
 assert.equal(typeof page.readPublicGuidePage,'function');
 const calls=[];
 const result=await page.readPublicGuidePage(id,env,async(url,options)=>{
  const u=new URL(url);calls.push(u.pathname);
  assert.equal(options.headers.apikey,'sb_publishable_test');assert.equal('Authorization' in options.headers,false);
  assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
  if(u.pathname.endsWith('/rpc/kinnso_guide'))return Response.json(guide);
  assert.equal(u.pathname,'/rest/v1/guides');assert.equal(options.method,'GET');
  assert.equal(u.searchParams.get('id'),'eq.'+id);assert.equal(u.searchParams.get('status'),'eq.published');assert.equal(u.searchParams.get('limit'),'1');
  assert.equal(u.searchParams.get('select'),'id,title,creator_name,published_at,cover_url');
  return Response.json([row]);
 });
 assert.deepEqual(result,{...guide,publication:{author:row.creator_name,publishedAt:row.published_at,coverUrl:row.cover_url}});assert.equal(calls.length,2);
});
test('missing or withdrawn content is absent, while failed or mismatched metadata stays an error',async()=>{
 assert.equal(typeof page.readPublicGuidePage,'function');
 let calls=0;
 assert.equal(await page.readPublicGuidePage(id,env,async()=>{calls++;return Response.json({message:'guide_not_found'},{status:400})}),null);assert.equal(calls,1);
 assert.equal(await page.readPublicGuidePage(id,env,async url=>new URL(url).pathname.endsWith('/rpc/kinnso_guide')?Response.json(guide):Response.json([])),null);
 for(const response of [()=>Response.json({error:'unavailable'},{status:503}),()=>Response.json([row,row]),()=>Response.json([{...row,id:'22222222-2222-4222-8222-222222222222'}])])
  await assert.rejects(page.readPublicGuidePage(id,env,async url=>new URL(url).pathname.endsWith('/rpc/kinnso_guide')?Response.json(guide):response()),/guide_unavailable|guide_schema/);
 calls=0;assert.equal(await page.readPublicGuidePage('bad-id',env,async()=>{calls++;throw Error('must not fetch')}),null);assert.equal(calls,0);
});
test('share metadata carries published author/date/cover without inventing image dimensions or translations',()=>{
 assert.equal(typeof page.guidePageMetadata,'function');
 const meta=page.guidePageMetadata({...guide,publication:{author:row.creator_name,publishedAt:row.published_at,coverUrl:row.cover_url}});
 assert.deepEqual(meta.authors,[{name:row.creator_name}]);assert.equal(meta.openGraph.publishedTime,row.published_at);assert.deepEqual(meta.openGraph.images,[{url:row.cover_url,alt:guide.title}]);
 assert.equal(meta.openGraph.modifiedTime,undefined);assert.equal(meta.alternates,undefined);assert.equal(meta.robots.index,false);
 assert.equal(meta.twitter.card,'summary_large_image');
});
test('structured author/date follow the published DTO instead of the supplemental row',()=>{
 assert.equal(typeof page.guidePageMetadata,'function');
 const structured={kind:'itinerary',id,title:guide.title,destinationId:null,version:1,publishedAt:'2026-08-01T10:00:00Z',creator:{id:'author',name:'Version author',handle:null},days:[],publication:{author:'Changed current author',publishedAt:row.published_at,coverUrl:null}};
 const meta=page.guidePageMetadata(structured);assert.deepEqual(meta.authors,[{name:'Version author'}]);assert.equal(meta.openGraph.publishedTime,structured.publishedAt);assert.equal(meta.twitter.card,'summary');assert.deepEqual(meta.openGraph.images,[]);
});
