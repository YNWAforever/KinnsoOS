import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as page from '../lib/seo/guide-publication.ts';
const summary={kind:'summary',id:'11111111-1111-4111-8111-111111111111',title:'Authored public title',summary:'A published summary',destinationId:null};
const publication={author:'Public creator credit',publishedAt:'2026-09-01T10:00:00Z',coverUrl:'https://cdn.kinnso.ai/public-cover.jpg'};
function data(guide){assert.equal(typeof page.guideStructuredData,'function');return JSON.parse(page.guideStructuredData(guide));}

test('summary structured data contains real public text and credits without inventing itinerary or release metadata',()=>{
 assert.deepEqual(data({...summary,publication,privateNote:'PRIVATE_NOTE',modifiedAt:'2030-01-01',language:'invented',canonicalUrl:'https://unapproved.test'}),{
  '@context':'https://schema.org','@type':'CreativeWork',name:summary.title,description:summary.summary,
  creditText:publication.author,datePublished:publication.publishedAt,image:publication.coverUrl,
 });
});
test('absent public metadata remains absent, and unsafe cover origins/tokens never become structured image URLs',()=>{
 assert.deepEqual(data(summary),{'@context':'https://schema.org','@type':'CreativeWork',name:summary.title,description:summary.summary});
 for(const coverUrl of ['https://private.test/image.jpg','https://cdn.kinnso.ai/image.jpg?token=private','javascript:alert(1)'])assert.equal(data({...summary,publication:{...publication,coverUrl}}).image,undefined);
});
test('authored structured guide sections preserve rendered order and public descriptions while excluding private fields and place claims',()=>{
 const structured={kind:'itinerary',id:summary.id,title:summary.title,destinationId:null,version:2,publishedAt:'2026-08-01T10:00:00Z',creator:{id:'PRIVATE_ACTOR_ID',name:'RPC public credit',handle:'public-handle'},
  publication,days:[{id:'day',offset:0,title:'Authored day',privateNote:'PRIVATE_DAY',stops:[
   {id:'stop-1',position:0,title:'First authored stop',description:'First public description',placeId:'PRIVATE_PLACE_ID',travellerNote:'PRIVATE_STOP',source:null},
   {id:'stop-2',position:1,title:'Second authored stop',description:'Second public description',source:null},
  ]}],media:[{url:'PRIVATE_MEDIA'}]};
 const result=data(structured);
 assert.equal(result.creditText,structured.creator.name);assert.equal(result.datePublished,structured.publishedAt);assert.equal(result.version,2);
 assert.deepEqual(result.hasPart,[{'@type':'CreativeWork',name:'Authored day',position:1,hasPart:[
  {'@type':'CreativeWork',name:'First authored stop',description:'First public description',position:1},
  {'@type':'CreativeWork',name:'Second authored stop',description:'Second public description',position:2},
 ]}]);
 assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
 for(const absent of ['description','dateModified','inLanguage','url','@id','itinerary','potentialAction','offers'])assert.equal(result[absent],undefined);
});
test('JSON-LD script serialization cannot close a script tag and preserves authored text when decoded',()=>{
 assert.equal(typeof page.guideStructuredData,'function');
 const hostile='</script><script>globalThis.__guideXss=1</script>&\u2028\u2029';
 const input={...summary,title:hostile,summary:hostile,publication:{...publication,author:hostile}};
 const serialized=page.guideStructuredData(input);
 assert.equal(/[<>&\u2028\u2029]/u.test(serialized),false);assert.equal(serialized.includes('</script>'),false);
 const result=JSON.parse(serialized);assert.equal(result.name,hostile);assert.equal(result.description,hostile);assert.equal(result.creditText,hostile);
});
