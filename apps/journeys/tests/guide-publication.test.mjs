import {test} from 'node:test';
import assert from 'node:assert/strict';
const page = await import('../lib/seo/guide-publication.ts').catch(() => ({}));
const id='11111111-1111-4111-8111-111111111111';
const guide={kind:'summary',id,title:'Published title',summary:'Authored summary',destinationId:null};
const row={id,title:guide.title,creator_name:'Published author',creator_handle:'published-author',published_at:'2026-09-01T10:00:00Z',cover_url:'https://cdn.kinnso.ai/published-cover.jpg'};
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};

test('publication projects only known public fields and binds guide identity and title',()=>{
 assert.equal(typeof page.publication,'function');
 assert.deepEqual(page.publication(guide,{...row,privateNote:'hidden',email:'private@example.test'}),{author:'Published author',authorHandle:'published-author',publishedAt:row.published_at,coverUrl:row.cover_url});
 assert.throws(()=>page.publication(guide,{...row,id:'22222222-2222-4222-8222-222222222222'}),/guide_schema/);
 assert.throws(()=>page.publication(guide,{...row,title:'A different current publication'}),/guide_schema/);
});
test('missing author/date/image stay absent and malformed dates remain schema errors',()=>{
 assert.equal(typeof page.publication,'function');
 assert.deepEqual(page.publication(guide,{...row,creator_name:null,creator_handle:null,published_at:null,cover_url:null}),{author:null,authorHandle:null,publishedAt:null,coverUrl:null});
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
  assert.equal(u.searchParams.get('select'),'id,title,creator_name,creator_handle,published_at,cover_url');
  return Response.json([row]);
 });
 assert.deepEqual(result,{...guide,publication:{author:row.creator_name,authorHandle:row.creator_handle,publishedAt:row.published_at,coverUrl:row.cover_url}});assert.equal(calls.length,2);
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
 assert.equal(meta.openGraph.modifiedTime,undefined);assert.equal(meta.alternates.canonical,`https://kinnso-os.vercel.app/en/g/${id}`);assert.equal(meta.robots.index,false);
 assert.equal(meta.twitter.card,'summary_large_image');
});
test('structured author/date follow the published DTO instead of the supplemental row',()=>{
 assert.equal(typeof page.guidePageMetadata,'function');
 const structured={kind:'itinerary',id,title:guide.title,destinationId:null,version:1,publishedAt:'2026-08-01T10:00:00Z',creator:{id:'author',name:'Version author',handle:null},days:[],publication:{author:'Changed current author',publishedAt:row.published_at,coverUrl:null}};
 const meta=page.guidePageMetadata(structured);assert.deepEqual(meta.authors,[{name:'Version author'}]);assert.equal(meta.openGraph.publishedTime,structured.publishedAt);assert.equal(meta.twitter.card,'summary');assert.deepEqual(meta.openGraph.images,[]);
});

test('guide metadata is canonical and guide source labels are localized in every public language',async()=>{
 const expected={en:'Guide source','zh-HK':'攻略來源','zh-tw':'攻略來源','zh-cn':'攻略来源',ja:'ガイドの出典',ko:'가이드 출처',th:'แหล่งที่มาของไกด์'};
 const {build}=await import('esbuild');
 const {createRequire}=await import('node:module');
 const {fileURLToPath}=await import('node:url');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../lib/seo/PublicGuideContent.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','next/image']});
 const component={exports:{}};
 new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),component,component.exports);
 for(const locale of Object.keys(expected)){
  const html=renderToStaticMarkup(component.exports.PublicGuideContent({guide,locale}));
  assert.ok(html.includes('<h2>'+expected[locale]+'</h2>'),locale);
  assert.ok(html.includes('<h1>Published title</h1>'),locale);
  const meta=page.guidePageMetadata(guide,locale);
  assert.equal(meta.alternates.canonical,`https://kinnso-os.vercel.app/${locale}/g/${id}`);
  assert.deepEqual(meta.robots,{index:false,follow:false});
 }
});
