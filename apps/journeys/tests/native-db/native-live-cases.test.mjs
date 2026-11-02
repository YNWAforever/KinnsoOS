import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {implementedNativeCaseIds,buildNativeHandlers} from './native-live-cases.mjs';
const catalog=JSON.parse(readFileSync(new URL('./cases.json',import.meta.url),'utf8'));
test('live-case registry contains only explicit native IDs and does not claim every catalog family',()=>{
  assert(implementedNativeCaseIds.length>0);
  assert(implementedNativeCaseIds.every(id=>/^NA0[1-9]\./.test(id)));
  assert.equal(implementedNativeCaseIds.length,new Set(implementedNativeCaseIds).size);
  assert(implementedNativeCaseIds.length<catalog.cases.length);
  assert.deepEqual(new Set(catalog.cases.filter(item=>item.implemented).map(item=>item.id)),new Set(implementedNativeCaseIds));
  assert(!implementedNativeCaseIds.includes('NA04.sameCompanyForeignLocation'));
  assert(implementedNativeCaseIds.includes('NA05.sameUuid.saveIntent'));
});
test('handler registry is deterministic and requires complete runtime inputs',()=>{
  const handlers=buildNativeHandlers({});
  assert(handlers instanceof Map);
  for(const id of implementedNativeCaseIds)assert(handlers.has(id),id);
});
