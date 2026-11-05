import test from 'node:test';import assert from 'node:assert/strict';
let resolve;try{({resolvePublishedGuideId:resolve}=await import('../lib/seo/legacy-guide.ts'));}catch{}
const id='11111111-1111-4111-8111-111111111111',slug='hong-kong-test';
const env={KINNSO_SUPABASE_URL:'https://approved.supabase.co',KINNSO_APPROVED_SUPABASE_ORIGIN:'https://approved.supabase.co',KINNSO_LEGACY_AUTH_ORIGIN:'https://approved.supabase.co',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
test('published slug resolves with anonymous bounded exact filtering',async()=>{assert.equal(await resolve(slug,env,async(url,options)=>{const u=new URL(url);assert.equal(u.pathname,'/rest/v1/guides');assert.equal(u.searchParams.get('slug'),'eq.'+slug);assert.equal(u.searchParams.get('status'),'eq.published');assert.equal(u.searchParams.get('limit'),'2');assert.equal(options.headers.apikey,'sb_publishable_test');assert.equal(options.headers.Authorization,undefined);assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');return Response.json([{id,slug,status:'published'}]);}),id);});
test('slug lookup never exposes absent, unpublished, mismatched or ambiguous records',async()=>{for(const rows of [[],[{id,slug,status:'draft'}],[{id,slug:'different',status:'published'}],[{id:'invalid',slug,status:'published'}],[{id,slug,status:'published'},{id,slug,status:'published'}]])assert.equal(await resolve(slug,env,async()=>Response.json(rows)),null);});
test('UUID and unsafe slug inputs make no lookup',async()=>{for(const value of [id,'../secret','x/y','x?token=a','%2f','x\\y','x'.repeat(241)]){let called=false;assert.equal(await resolve(value,env,async()=>{called=true;return Response.json([])}),null);assert.equal(called,false);}});
test('backend failure remains unavailable rather than a false missing publication',async()=>{await assert.rejects(resolve(slug,env,async()=>Response.json({},{status:503})),/guide_unavailable/);await assert.rejects(resolve(slug,{},async()=>Response.json([])),/guide_unconfigured/);});
test('publication withdrawn after slug lookup is not rendered',async()=>{
 const {readPublicGuidePage}=await import('../lib/seo/guide-publication.ts');
 const resolved=await resolve(slug,env,async()=>Response.json([{id,slug,status:'published'}]));
 assert.equal(await readPublicGuidePage(resolved,env,async()=>Response.json({message:'guide_not_found'},{status:400})),null);
});
