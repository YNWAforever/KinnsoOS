import {test} from 'node:test';
import assert from 'node:assert/strict';
const source=await import('../lib/guides/source-summary.ts').catch(()=>({}));
const structured={kind:'itinerary',id:'guide',title:'Author text',creator:{name:'Original author',id:'author',handle:null},version:7,publishedAt:'2026-10-20T10:00:00Z',days:[{stops:[{},{}]},{stops:[{}]}]};
const describe=value=>{assert.equal(typeof source.describeGuideSource,'function','source summary projection must exist');return source.describeGuideSource(value);};
test('structured provenance uses its published DTO and counts only actual days/stops',()=>{
 assert.deepEqual(describe({...structured,publication:{author:'Supplemental author',publishedAt:'2026-10-21T10:00:00Z'},privateNote:'DO_NOT_PROJECT'}),{kind:'itinerary',authorName:'Original author',version:7,publishedAt:structured.publishedAt,dayCount:2,stopCount:3});
});
test('summary credits use only supplied publication metadata; counts/version remain unknown',()=>{
 assert.deepEqual(describe({kind:'summary',title:'Reading',summary:'No structured stops',publication:{author:'Known author',publishedAt:'2026-10-19T00:00:00Z'}}),{kind:'summary',authorName:'Known author',version:null,publishedAt:'2026-10-19T00:00:00Z',dayCount:null,stopCount:null});
});
test('missing summary source stays null without inventing locale, verification time or private fields',()=>{
 assert.deepEqual(describe({kind:'summary',title:'Reading',summary:'Original language',authorLocale:'FAKE',verifiedAt:'FAKE',privateContact:'PRIVATE'}),{kind:'summary',authorName:null,version:null,publishedAt:null,dayCount:null,stopCount:null});
});
test('empty author is unknown; an empty structured version has zero actual counts',()=>{
 assert.deepEqual(describe({...structured,creator:{name:'  '},days:[]}),{kind:'itinerary',authorName:null,version:7,publishedAt:structured.publishedAt,dayCount:0,stopCount:0});
});
