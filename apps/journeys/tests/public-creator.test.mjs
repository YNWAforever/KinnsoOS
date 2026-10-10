import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
const subject=await import('../lib/seo/public-creator.ts');
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const id='e1c2820d-25e5-9795-54b5-637be546e04a';
const row={id,handle:'real-creator',display_name:'Public name',bio:'Public bio',privateDna:'NEVER'};

const compiled=await transform(await readFile(new URL('../lib/seo/PublicCreatorContent.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
const component={exports:{}};
new Function('require','module','exports',compiled.code)(createRequire(import.meta.url),component,component.exports);
for(const locale of ['en','zh-HK'])test('public creator SSR separates unknown authored language from localized navigation: '+locale,()=>{
 const creator={id,handle:row.handle,name:'作者原名',bio:'Original bio <script>unsafe()</script>\nSecond line',guides:[{id,title:'Original guide title'}],hasMore:true};
 const html=renderToStaticMarkup(component.exports.PublicCreatorContent({creator,locale}));
 assert.match(html,/<h1 lang="">作者原名<\/h1>/);
 assert.match(html,/<p lang=""[^>]*>Original bio &lt;script&gt;unsafe\(\)&lt;\/script&gt;\nSecond line<\/p>/);
 assert.match(html,new RegExp('<a[^>]*lang=""[^>]*href="/'+locale+'/g/'+id+'"[^>]*>Original guide title</a>|<a[^>]*href="/'+locale+'/g/'+id+'"[^>]*lang=""[^>]*>Original guide title</a>'));
 assert.ok(html.includes('<h2>'+(locale==='en'?'Published guides':'已發布攻略')+'</h2>'));
 assert.ok(html.includes('aria-label="'+(locale==='en'?'Public creator profile':'創作者公開檔案')+'"'));
 assert.ok(html.includes('>'+(locale==='en'?'View more on original profile':'在原站檔案查看更多')+'</a>'));
 assert.ok(!html.includes('<script>'));
 const empty=renderToStaticMarkup(component.exports.PublicCreatorContent({creator:{...creator,bio:'',guides:[],hasMore:false},locale}));
 assert.ok(empty.includes('<p>'+(locale==='en'?'No published guides yet.':'尚未有已發布攻略。')+'</p>'));
 assert.ok(empty.includes('>'+(locale==='en'?'View original profile':'查看原站檔案')+'</a>'));
});
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
