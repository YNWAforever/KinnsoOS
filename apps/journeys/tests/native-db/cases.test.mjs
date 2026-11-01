import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('./cases.json',import.meta.url),'utf8'));
test('native command gate oracle distinguishes metadata writes from licensed ingestion',()=>{
 const commands=['savePreferences','clearPreferences','saveIntent','archiveIntent','deleteIntent','beginLink','confirmLink','revokeLink','importOffer','preparePublication','grantContentUse','revokeContentUse','publishOffer','withdrawOffer','recordMatch','chooseOffer'];
 for(const command of commands){
  const find=state=>catalog.cases.find(c=>c.id===`NA03.${command}.${state}`);
  assert.equal(find('privateOnly').expected,find('allOpen').expected,command+' is guarded by private_writes, with valid authority/rights where required');
  assert.notEqual(find('closed').expected,find('allOpen').expected);
 }
 for(const entry of ['licensedIngest','boundLicensedWrite']){
  const find=state=>catalog.cases.find(c=>c.id===`NA03.${entry}.${state}`);
  assert(find('privateOnly'),entry+' gate family required');assert.notEqual(find('privateOnly').expected,find('allOpen').expected);
 }
});
test('native coverage cases are unique, required, unexpanded and distinguish handlers from remaining work',()=>{
 assert.equal(catalog.expanded,false);assert.equal(new Set(catalog.cases.map(c=>c.id)).size,catalog.cases.length);
  assert(catalog.cases.every(c=>c.required&&typeof c.implemented==='boolean'&&['L1','L2'].includes(c.evidenceLevel)&&c.expected));
  assert(catalog.cases.some(c=>c.implemented));
  assert(catalog.cases.some(c=>!c.implemented));
  assert(catalog.cases.filter(c=>c.implemented).every(c=>c.handler==='tests/native-db/native-live-cases.mjs'));
});
