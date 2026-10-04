import test from 'node:test';
import assert from 'node:assert/strict';
const policy = await import('../lib/seo/migration-policy.ts').catch(() => ({}));
const parity = await import('../scripts/check-url-parity.mjs');
const server = await import('../lib/seo/public-guide.ts').catch(()=>({}));
const {validateMappings}=await import('../lib/seo/redirects.ts');
test('mapping validation disallows loops, chains and invented retention targets',()=>{
 const a='https://www.kinnso.ai/en/g/a',b='https://www.kinnso.ai/en/g/b',c='https://www.kinnso.ai/en/g/c';
 validateMappings([{oldUrl:a,newUrl:a,disposition:'retain',reason:'Original still serves'}]);
 assert.throws(()=>validateMappings([{oldUrl:a,newUrl:b,disposition:'retain',reason:'x'}]));
 assert.throws(()=>validateMappings([{oldUrl:a,newUrl:b,disposition:'redirect',reason:'x'},{oldUrl:b,newUrl:c,disposition:'redirect',reason:'x'}]));
});
test('SSR guide schema rejects malformed itinerary and projects only public DTO',()=>{
 assert.equal(typeof server.publicGuide,'function');
 assert.throws(()=>server.publicGuide({kind:'itinerary',id:'x',title:'Title',days:[]}));
 assert.deepEqual(server.publicGuide({kind:'summary',id:'x',title:'Title',summary:'Published',destinationId:null,secret:'private'}),{kind:'summary',id:'x',title:'Title',summary:'Published',destinationId:null});
 const authored={kind:'itinerary',id:'x',title:'Title',destinationId:null,version:1,publishedAt:'2030-01-01T00:00:00Z',creator:{id:'author',name:'Author',handle:null},days:[{id:'d',offset:0,title:'Authored day',stops:[{id:'s',title:'Stop',description:'Authored description',placeId:null,position:0,startMinuteOfDay:600,durationMinutes:45,source:null,travellerNote:'must not leak'}]}]};
 const projected=server.publicGuide(authored);assert.equal(projected.days[0].stops[0].startMinuteOfDay,600);assert.equal('travellerNote' in projected.days[0].stops[0],false);
 assert.throws(()=>server.publicGuide({...authored,days:[{...authored.days[0],stops:[{...authored.days[0].stops[0],source:{private:true}}]}]}));
});
test('XML sitemap parser decodes and rejects offsite shards',()=>{
 assert.deepEqual(parity.locations('<urlset><url><loc>https://www.kinnso.ai/en/g/a&amp;b</loc></url></urlset>'),['https://www.kinnso.ai/en/g/a&b']);
 assert.throws(()=>parity.locations('<sitemapindex><loc>https://evil.test/x</loc></sitemapindex>'));
 assert.equal(parity.xmlEscape('a&<"'), 'a&amp;&lt;&quot;');
 assert.equal(parity.approvedUrl('https://remix-kinnso-web.vercel.app/en/guides/authored'),'https://remix-kinnso-web.vercel.app/en/guides/authored');
 assert.throws(()=>parity.locations('<urlset><loc>https://www.kinnso.ai/en/g/a</loc></urlset>','https://remix-kinnso-web.vercel.app'));
});
test('launch remains closed in every deployment', () => {
  assert.equal(typeof policy.migrationRobots, 'function');
  assert.deepEqual(policy.migrationRobots(), {index:false,follow:false});
});
test('metadata advertises only real content locales and keeps legacy canonical', () => {
  assert.equal(typeof policy.contentMetadata, 'function');
  const meta = policy.contentMetadata({id:'real-id',kind:'guide',title:'Real guide',description:'Description',canonicalUrl:'https://www.kinnso.ai/en/g/real',locales:{en:'https://www.kinnso.ai/en/g/real'}});
  assert.equal(meta.alternates.canonical,'https://www.kinnso.ai/en/g/real');
  assert.deepEqual(Object.keys(meta.alternates.languages),['en','x-default']);
  assert.equal(meta.robots.index,false);
});
test('public URL allowlist rejects private, credentials and offsite URLs', () => {
  assert.equal(typeof policy.publicUrl,'function');
  for (const url of ['https://www.kinnso.ai/en/trips/x','https://evil.test/en/g/x','https://user@www.kinnso.ai/en/g/x','https://www.kinnso.ai/en/g/x?token=x']) assert.throws(()=>policy.publicUrl(url));
});
test('metadata schema failures remain errors', () => {
  assert.equal(typeof policy.contentMetadata,'function');
  assert.throws(()=>policy.contentMetadata({id:'',kind:'guide',title:'',locales:{}}));
});
