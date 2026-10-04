import test from 'node:test';
import assert from 'node:assert/strict';
const subject=await import('../lib/seo/public-article.ts').catch(()=>({}));
const presentation=await import('../lib/seo/article-presentation.ts').catch(()=>({}));
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const id='00000000-0000-0000-0000-000000000901';
const blocks=[{id:'body',type:'text',title:'Authored section',content:'<p>Real <strong>content</strong><script>unsafe()</script><a href="javascript:bad()">link</a><img src="https://evil.test/a" onerror="bad()"></p>',privateMarker:'NEVER'}];
const row={id,url:'real-article',category:'destination',thumbnails:['https://cdn.kinnso.ai/cover.jpg'],published_at:'2026-01-01T00:00:00Z',edit_at:null,authors:['real-author'],article_translations:[{locale:'zh-hk',title:'Authored title',summary:'Authored summary',meta_title:null,meta_description:null,og_image:'https://cdn.kinnso.ai/share.jpg',content:blocks}],privateMarker:'NEVER'};
test('anonymous article reads bind exact category, slug and authored locale; never fetch owner projections',async()=>{
 assert.equal(typeof subject.readPublicArticle,'function');let calls=0;
 const dto=await subject.readPublicArticle('destinations','real-article','zh-HK',env,async(input,options)=>{
  const url=new URL(input);assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{apikey:env.KINNSO_SUPABASE_PUBLISHABLE_KEY});
  if(calls++===0){assert.equal(url.pathname,'/rest/v1/articles');assert.equal(url.searchParams.get('url'),'eq.real-article');assert.equal(url.searchParams.get('category'),'eq.destination');assert.equal(url.searchParams.get('article_translations.locale'),'eq.zh-hk');assert.equal(url.searchParams.get('deleted_at'),'is.null');assert.equal(url.searchParams.get('limit'),'1');assert.ok(url.searchParams.get('published_at').startsWith('lte.'));assert.ok(url.searchParams.get('or').startsWith('(end_at.is.null,end_at.gte.'));assert.ok(!url.searchParams.get('select').includes('*'));return Response.json([row]);}
  if(url.pathname==='/rest/v1/article_authors'){assert.equal(url.searchParams.get('select'),'name');assert.equal(url.searchParams.get('is_active'),'eq.true');assert.equal(url.searchParams.get('locale'),'eq.zh-hk');assert.equal(url.searchParams.get('limit'),'1');return Response.json([{name:'Real author',privateMarker:'NEVER'}]);}
  assert.equal(url.pathname,'/rest/v1/article_faqs');assert.equal(url.searchParams.get('article_id'),'eq.'+id);assert.equal(url.searchParams.get('locale'),'eq.zh-hk');assert.equal(url.searchParams.get('limit'),'51');return Response.json([{question:'Real question',answer:'Real answer'}]);
 });
 assert.equal(calls,3);assert.equal(dto.title,'Authored title');assert.equal(dto.locale,'zh-hk');assert.equal(dto.author,'Real author');assert.equal(dto.coverImage,'https://cdn.kinnso.ai/cover.jpg');assert.equal(dto.shareImage,'https://cdn.kinnso.ai/share.jpg');assert.equal(dto.blocks[0].html,'<p>Real <strong>content</strong><a rel="noopener noreferrer nofollow">link</a></p>');assert.ok(!JSON.stringify(dto).includes('NEVER'));assert.deepEqual(dto.faqs,[{question:'Real question',answer:'Real answer'}]);
});
test('invalid routes, missing exact translation and withdrawn articles cannot become guessed content',async()=>{
 assert.equal(typeof subject.readPublicArticle,'function');let calls=0;
 for(const [category,slug,locale] of [['bad','real-article','en'],['dining','../secret','en'],['dining','x?key=y','en'],['dining','x','ja'],['dining','x'.repeat(201),'en']])assert.equal(await subject.readPublicArticle(category,slug,locale,env,async()=>{calls++;throw Error('not allowed')}),null);
 assert.equal(calls,0);assert.equal(await subject.readPublicArticle('destinations','real-article','en',env,async()=>Response.json([])),null);
 assert.equal(await subject.readPublicArticle('destinations','real-article','en',env,async()=>Response.json([row])),null);
 await assert.rejects(subject.readPublicArticle('destinations','real-article','en',{},async()=>{throw Error('not allowed')}),/article_unconfigured/);
 await assert.rejects(subject.readPublicArticle('destinations','real-article','en',env,async()=>Response.json([],{status:403})),/article_unavailable/);
});
test('bounded article contracts reject wrong identity, duplicate translations, oversized content and unsupported blocks',async()=>{
 assert.equal(typeof subject.readPublicArticle,'function');
 for(const value of [[row,row],[{...row,url:'other'}],[{...row,category:'dining'}],[{...row,published_at:'bad'}],[{...row,article_translations:[...row.article_translations,...row.article_translations]}],[{...row,article_translations:[{...row.article_translations[0],content:Array(1001).fill(blocks[0])}]}]])await assert.rejects(subject.readPublicArticle('destinations','real-article','zh-HK',env,async()=>Response.json(value)),/article_schema/);
 const parsed=subject.articleBlocks(JSON.stringify([...blocks,{id:'ignored',type:'unknown',content:'NEVER'},{id:'detail',type:'detail-box',title:'Visit',time:'9 AM',address:{label:'Address',link:'javascript:bad()'},website:{label:'Website',link:'https://example.com'},privateMarker:'NEVER'}]));
 assert.equal(parsed.length,2);assert.equal(parsed[1].fields[1].label,'Address');assert.equal(parsed[1].fields[1].href,null);assert.equal(parsed[1].fields[2].href,'https://example.com/');assert.ok(!JSON.stringify(parsed).includes('NEVER'));
});
test('article metadata uses only the actual authored locale, source dates and safe inert JSON-LD',()=>{
 assert.equal(typeof presentation.articlePageMetadata,'function');
 const article={id,slug:row.url,category:'destinations',locale:'zh-hk',title:'Authored </script> title',summary:'Real summary',metadataTitle:'Authored </script> title',description:'Real summary',author:'Real author',publishedAt:row.published_at,updatedAt:null,coverImage:row.thumbnails[0],shareImage:row.article_translations[0].og_image,blocks:[],faqs:[]};
 const meta=presentation.articlePageMetadata(article);assert.equal(meta.alternates.canonical,'https://remix-kinnso-web.vercel.app/zh-hk/articles/destinations/real-article');assert.equal(meta.alternates.languages,undefined);assert.deepEqual(meta.robots,{index:false,follow:false});assert.equal(meta.openGraph.publishedTime,row.published_at);assert.equal(meta.openGraph.modifiedTime,undefined);
 assert.deepEqual(meta.openGraph.images,[{url:article.shareImage,alt:article.title}]);assert.equal(meta.twitter.card,'summary_large_image');assert.deepEqual(meta.twitter.images,[article.shareImage]);
 const json=presentation.articleStructuredData(article);assert.ok(!json.includes('</script>'));const data=JSON.parse(json);assert.equal(data.headline,article.title);assert.equal(data.inLanguage,'zh-hk');assert.equal(data.datePublished,row.published_at);assert.equal(data.dateModified,undefined);assert.deepEqual(data.image,[article.coverImage]);assert.equal(data.creditText,'Real author');
});
test('article cover and share images are bounded approved CDN URLs with safe authored fallback',async()=>{
 for(const image of ['https://evil.test/cover.jpg','https://cdn.kinnso.ai/a?token=secret','https://user:secret@cdn.kinnso.ai/a','javascript:bad()']){
  const value={...row,authors:[],thumbnails:[image,row.thumbnails[0]],article_translations:[{...row.article_translations[0],og_image:image}]};
  const dto=await subject.readPublicArticle('destinations',row.url,'zh-HK',env,async url=>Response.json(new URL(url).pathname==='/rest/v1/articles'?[value]:[]));
  assert.equal(dto.coverImage,row.thumbnails[0]);assert.equal(dto.shareImage,row.thumbnails[0]);
 }
 await assert.rejects(subject.readPublicArticle('destinations',row.url,'zh-HK',env,async()=>Response.json([{...row,thumbnails:Array(101).fill(row.thumbnails[0])}])),/article_schema/);
});
