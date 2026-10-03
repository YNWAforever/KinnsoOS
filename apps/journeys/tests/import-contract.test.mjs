import {test} from 'node:test';import assert from 'node:assert/strict';
const importer=await import('../lib/trips/import.ts').catch(()=>({}));
test('import preview scopes to selected owner and strips demo trust and business fields',()=>{
 assert.equal(typeof importer.previewLocalImport,'function');
 const input={ownerId:'local-owner',title:'Route',timezone:'Asia/Tokyo',startDate:null,days:[{offset:0,title:'Day',stops:[{title:'Place',travellerNote:'Private',source:{creatorId:'fake'},role:'ops'}]}],payout:{amount:100}};
 const preview=importer.previewLocalImport(input,'local-owner');assert.equal(preview.ok,true);assert.equal(preview.payload.days[0].stops[0].source,undefined);assert.equal(preview.payload.payout,undefined);
 assert.equal(importer.previewLocalImport(input,'other').ok,false);
 assert.equal(importer.previewLocalImport({...input,days:Array(31).fill(input.days[0])},'local-owner').ok,false);
});
