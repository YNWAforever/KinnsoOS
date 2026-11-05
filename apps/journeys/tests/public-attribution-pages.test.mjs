import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

const require=createRequire(import.meta.url);
const id='11111111-1111-4111-8111-111111111111';
const creator={id:'e1c2820d-25e5-9795-54b5-637be546e04a',handle:'public-creator',name:'Authored creator',bio:'Authored bio',guides:[],hasMore:false,page:1};
const guide={kind:'summary',id,title:'Authored guide',summary:'Authored summary',destinationId:null,publication:{author:'Authored creator',publishedAt:'2026-01-01T00:00:00Z',coverUrl:null}};
const bundled=await build({entryPoints:[fileURLToPath(new URL('../app/[locale]/[[...route]]/page.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime','next/navigation'],plugins:[{name:'attribution-page-fixture',setup(build){
 build.onResolve({filter:/travel\/Workbench$/},()=>({path:'fixture-workbench',external:true}));
 build.onResolve({filter:/(auth\/actor|supabase\/server)$/},()=>({path:'fixture-private',external:true}));
 build.onResolve({filter:/seo\/public-creator$/},()=>({path:'fixture-creator',external:true}));
 build.onResolve({filter:/seo\/guide-publication$/},()=>({path:'fixture-guide',external:true}));
 build.onResolve({filter:/seo\/legacy-guide$/},()=>({path:'fixture-guide-reference',external:true}));
}}]});
const page={exports:{}};
new Function('require','module','exports',bundled.outputFiles[0].text)((name)=>{
 if(name==='fixture-workbench')return{Workbench:()=>{throw Error('PUBLIC_ROUTE_MOUNTED_WORKBENCH')}};
 if(name==='fixture-private')return{currentActor:()=>{throw Error('PUBLIC_ROUTE_QUERIED_PRIVATE_ACTOR')},serverClient:()=>{throw Error('PUBLIC_ROUTE_OPENED_PRIVATE_CLIENT')}};
 if(name==='fixture-creator')return{
  readPublicCreator:async(handle,pageNumber=1)=>handle===creator.handle?{...creator,page:pageNumber}:null,
  creatorPageMetadata:(value,locale)=>({title:value.name,alternates:{canonical:`https://kinnso-os.vercel.app/${locale}/c/${value.handle}`},robots:{index:false,follow:false}}),
 };
 if(name==='fixture-guide')return{
  readPublicGuidePage:async value=>value===id?guide:null,
  guidePageMetadata:(value,locale)=>({title:value.title,alternates:{canonical:`https://kinnso-os.vercel.app/${locale}/g/${value.id}`},robots:{index:false,follow:false}}),
 };
 if(name==='fixture-guide-reference')return{
  isGuideSlug:value=>value==='authored-guide',
  resolvePublishedGuideId:async value=>value==='authored-guide'?id:null,
 };
 if(name==='next/navigation')return{notFound:()=>{throw Error('NOT_FOUND')},redirect:target=>{throw Object.assign(Error('REDIRECT'),{target})}};
 return require(name);
},page,page.exports);

for(const locale of ['en','zh-HK','zh-tw','zh-cn','ja','ko','th']){
 test('creator page renders without private actor: '+locale,async()=>{
  const html=renderToStaticMarkup(await page.exports.default({params:Promise.resolve({locale,route:['c',creator.handle]}),searchParams:Promise.resolve({})}));
  assert.match(html,/<h1 lang="">Authored creator<\/h1>/);
  const meta=await page.exports.generateMetadata({params:Promise.resolve({locale,route:['c',creator.handle]})});
  assert.equal(meta.alternates.canonical,`https://kinnso-os.vercel.app/${locale}/c/${creator.handle}`);
 });
 test('guide page renders without private actor: '+locale,async()=>{
  const html=renderToStaticMarkup(await page.exports.default({params:Promise.resolve({locale,route:['g',id]}),searchParams:Promise.resolve({})}));
  assert.match(html,/<h1>Authored guide<\/h1>/);
  const meta=await page.exports.generateMetadata({params:Promise.resolve({locale,route:['g',id]})});
  assert.equal(meta.alternates.canonical,`https://kinnso-os.vercel.app/${locale}/g/${id}`);
 });
}

test('published guide aliases redirect only after a successful published read',async()=>{
 await assert.rejects(page.exports.default({params:Promise.resolve({locale:'en',route:['g','authored-guide']}),searchParams:Promise.resolve({})}),error=>{
  assert.equal(error.message,'REDIRECT');assert.equal(error.target,'/en/g/'+id);return true;
 });
});
