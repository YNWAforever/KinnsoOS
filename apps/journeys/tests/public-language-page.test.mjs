import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const {contentLanguage}=await import('../lib/seo/public-language.ts');
const requests=[];
const fixture=(locale)=>({id:'11111111-1111-4111-8111-111111111111',slug:'authored',category:'destinations',locale,title:'Authored '+locale,summary:'Summary',metadataTitle:'Authored '+locale,description:'Summary',author:null,publishedAt:'2026-01-01T00:00:00Z',updatedAt:null,coverImage:null,shareImage:null,blocks:[],faqs:[{question:'Question '+locale,answer:'Answer '+locale}]});
const bundle=await build({entryPoints:[fileURLToPath(new URL('../app/[locale]/[[...route]]/page.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','next/navigation'],plugins:[{name:'public-page-isolation',setup(b){
 b.onResolve({filter:/travel\/Workbench$/},()=>({path:'fixture-workbench',external:true}));
 b.onResolve({filter:/seo\/public-article$/},()=>({path:'fixture-article',external:true}));
 b.onResolve({filter:/(auth\/actor|supabase\/server)$/},()=>({path:'fixture-private',external:true}));
}}]});
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(name=>{
 if(name==='fixture-workbench')return{Workbench:()=>{throw Error('Must not invent a translated workspace')}};
 if(name==='fixture-private')return{currentActor:()=>{throw Error('Private identity must not be queried')},serverClient:()=>{throw Error('Private client must not be queried')}};
 if(name==='fixture-article')return{readPublicArticle:async(category,slug,locale)=>{requests.push({category,slug,locale});return fixture(locale)}};
 if(name==='next/navigation')return{notFound:()=>{throw Error('NOT_FOUND')},redirect:()=>{throw Error('UNEXPECTED_REDIRECT')}};
 return require(name);
},mod,mod.exports);
for(const [locale,heading]of [['ja','よくある質問'],['ko','자주 묻는 질문'],['th','คำถามที่พบบ่อย'],['zh-tw','常見問題'],['zh-cn','常见问题']])test('public article route renders authored '+locale+' without private workspace lookup',async()=>{
 const params=Promise.resolve({locale,route:['articles','destinations','authored']});const result=await mod.exports.default({params});const html=renderToStaticMarkup(result);
 assert.ok(html.includes('lang="'+contentLanguage(locale)+'"'));assert.ok(html.includes('Authored '+locale));assert.ok(html.includes(heading));assert.ok(!html.includes('remix-kinnso'));assert.ok(!html.includes('View original article'));
 const meta=await mod.exports.generateMetadata({params});assert.equal(meta.alternates.canonical,`https://kinnso-os.vercel.app/${locale}/articles/destinations/authored`);
});
test('adding public languages does not invent private workspace translations',async()=>{for(const route of [['studio'],['trips'],['articles','invalid']])await assert.rejects(mod.exports.default({params:Promise.resolve({locale:'ja',route})}),/NOT_FOUND/);});
function environment(t){for(const[key,value]of Object.entries({KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'})){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}}
test('category route renders anonymous search results and preserves filters across pages',async t=>{
 environment(t);t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(new URL(url).hostname,'approved.supabase.co');const body=JSON.parse(options.body);assert.equal(body.p_locale,'ja');assert.equal(body.p_category,'destination');assert.equal(body.p_offset,12);assert.equal(body.p_q,'tea');return Response.json([{url:'published',category:'destination',title:'掲載記事',summary:'Summary',thumbnails:[],published_at:'2026-01-01T00:00:00Z',total_count:30}]);});
 const html=renderToStaticMarkup(await mod.exports.default({params:Promise.resolve({locale:'ja',route:['articles','destinations']}),searchParams:Promise.resolve({q:'tea',region:'tokyo',page:'2'})}));
 assert.ok(html.includes('掲載記事'));assert.ok(html.includes('href="/ja/articles/destinations/published"'));assert.ok(html.includes('page=3&amp;q=tea&amp;region=tokyo'));assert.ok(!html.includes('remix-kinnso'));assert.ok(html.includes('method="get"'));
});
test('article hub reads all three categories while empty later pages and duplicate filters return missing',async t=>{
 environment(t);const categories=[];t.mock.method(globalThis,'fetch',async(url,options)=>{categories.push(JSON.parse(options.body).p_category);return Response.json([])});
 const html=renderToStaticMarkup(await mod.exports.default({params:Promise.resolve({locale:'th',route:['articles']})}));assert.deepEqual(categories,['destination','dining','shopping']);assert.ok(html.includes('/th/articles/shopping'));
 await assert.rejects(mod.exports.default({params:Promise.resolve({locale:'th',route:['articles','dining']}),searchParams:Promise.resolve({page:'2'})}),/NOT_FOUND/);
 const calls=categories.length;await assert.rejects(mod.exports.default({params:Promise.resolve({locale:'th',route:['articles','dining']}),searchParams:Promise.resolve({page:['1','2']})}),/NOT_FOUND/);assert.equal(categories.length,calls);
});
