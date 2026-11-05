import test from 'node:test';
import assert from 'node:assert/strict';
let legacyEntry;
try { ({legacyEntry}=await import('../lib/routing/legacy-entry.ts')); } catch {}
const id='b36941a1-57b2-4f8b-bd92-f4f2e5df12c5';
test('legacy entry preserves native paths and normalizes only supported locale aliases',()=>{
 assert.deepEqual(legacyEntry('/zh-hk/trips','GET'),{pathname:'/zh-HK/trips'});
 assert.equal(legacyEntry('/en/trips','GET'),null);
 for(const locale of ['ja','ko','th','zh-tw','zh-cn'])assert.equal(legacyEntry(`/${locale}/creator`,'GET'),null);
});
test('legacy creator entry maps to the native workspace',()=>{
 assert.deepEqual(legacyEntry('/en/creator','GET'),{pathname:'/en/studio'});
 assert.deepEqual(legacyEntry('/zh-hk/creator','HEAD'),{pathname:'/zh-HK/studio'});
});
test('legacy campaign detail retains the requested campaign for authorized server resolution',()=>{
 for(const prefix of ['merchants/dashboard/missions','merchants/missions'])
 assert.deepEqual(legacyEntry(`/en/${prefix}/${id}`,'GET'),{pathname:`/en/merchant/campaigns/${id}`,campaignId:id});
 assert.equal(legacyEntry('/en/merchants/dashboard/missions/not-a-uuid','GET'),null);
});
test('legacy entry never redirects mutation, auth callback, ambiguous or encoded paths',()=>{
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(legacyEntry('/zh-hk/creator',method),null);
 for(const path of ['/zh-hk/auth/callback','/zh-hk/%61uth/callback','/zh-hk/%63allback','//en/creator','/en/../creator','/en/%2e%2e/creator','/en/creator?next=https://evil.test','/en/creator#x','/en/creator/','/en/creator\\x'])assert.equal(legacyEntry(path,'GET'),null);
});

test('locale alias preserves dotted handles and encoded Unicode content identifiers',()=>{for(const suffix of ['c/jane.doe','g/香港攻略','articles/destinations/%E9%A6%99%E6%B8%AF'])assert.deepEqual(legacyEntry('/zh-hk/'+suffix,'GET'),{pathname:'/zh-HK/'+suffix});for(const suffix of ['g/%2fsecret','g/%5csecret','g/%252fsecret','g/%2e%2e','g/%00secret','g/%ZZ'])assert.equal(legacyEntry('/zh-hk/'+suffix,'GET'),null);});
