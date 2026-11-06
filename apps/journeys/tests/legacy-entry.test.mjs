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
test('legacy public and recovery entry aliases map only safe GET navigation',()=>{
 assert.deepEqual(legacyEntry('/en/feed','GET'),{pathname:'/en/explore'});
 assert.deepEqual(legacyEntry('/zh-hk/feed','HEAD'),{pathname:'/zh-HK/explore'});
 assert.deepEqual(legacyEntry('/en/for-merchants','GET'),{pathname:'/en/for-business'});
 assert.deepEqual(legacyEntry('/zh-hk/auth/reset-password','GET'),{pathname:'/zh-HK/reset-password'});
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(legacyEntry('/en/auth/reset-password',method),null);
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

test('legacy operations routes map to the native operations workspaces',()=>{
 const cases=new Map([
  ['admin',{pathname:'/en/ops',search:{view:'overview'}}],
  ['admin/analytics',{pathname:'/en/ops',search:{view:'analytics'}}],
  ['admin/creators',{pathname:'/en/ops',search:{view:'creators'}}],
  ['admin/creators/directory',{pathname:'/en/ops',search:{view:'creators'}}],
  ['admin/creators/11111111-1111-4111-8111-111111111111',{pathname:'/en/ops',search:{view:'creators',creator:'11111111-1111-4111-8111-111111111111'}}],
  ['admin/creators/payouts',{pathname:'/en/ops',search:{view:'payouts'}}],
  ['admin/enquiries',{pathname:'/en/ops/support'}],
  ['admin/merchants',{pathname:'/en/ops',search:{view:'merchants'}}],
  ['admin/merchants/directory',{pathname:'/en/ops',search:{view:'merchants'}}],
  ['admin/merchants/applications',{pathname:'/en/ops/merchants'}],
  ['admin/merchants/11111111-1111-4111-8111-111111111111',{pathname:'/en/ops',search:{view:'merchants',merchant:'11111111-1111-4111-8111-111111111111'}}],
  ['admin/missions',{pathname:'/en/ops',search:{view:'missions'}}],
  ['admin/missions/review',{pathname:'/en/ops',search:{view:'reviews'}}],
  ['admin/missions/11111111-1111-4111-8111-111111111111',{pathname:'/en/ops',search:{missionId:'11111111-1111-4111-8111-111111111111'}}],
  ['admin/perks',{pathname:'/en/ops',search:{view:'perks'}}],
  ['admin/sessions',{pathname:'/en/ops',search:{view:'sessions'}}],
  ['admin/team',{pathname:'/en/ops',search:{view:'team'}}],
  ['admin/team/directory',{pathname:'/en/ops',search:{view:'team'}}],
  ['admin/testimonials',{pathname:'/en/ops',search:{view:'testimonials'}}],
  ['admin/users',{pathname:'/en/ops',search:{view:'users'}}],
 ]);
 for(const [path,expected] of cases)assert.deepEqual(legacyEntry('/en/'+path,'GET'),expected,path);
 for(const path of ['admin/unknown','admin/creators/not-a-uuid','admin/merchants/not-a-uuid','admin/missions/not-a-uuid'])assert.equal(legacyEntry('/en/'+path,'GET'),null,path);
});

test('legacy creator and merchant entry routes map to native workspaces without losing section intent',()=>{
 const cases=new Map([
  ['creators/apply',{pathname:'/en/studio'}],
  ['merchants/apply',{pathname:'/en/merchant'}],
  ['merchants/creators',{pathname:'/en/merchant',search:{section:'creators'}}],
  ['merchants/insights',{pathname:'/en/merchant',search:{section:'insights'}}],
  ['merchants/missions',{pathname:'/en/merchant',search:{section:'missions'}}],
  ['merchants/post',{pathname:'/en/merchant',search:{section:'post'}}],
  ['merchants/dashboard',{pathname:'/en/merchant'}],
  ['merchants/dashboard/creators',{pathname:'/en/merchant',search:{section:'creators'}}],
  ['merchants/dashboard/missions',{pathname:'/en/merchant',search:{section:'missions'}}],
  ['merchants/dashboard/offers',{pathname:'/en/merchant',search:{section:'offers'}}],
  ['merchants/dashboard/redeem',{pathname:'/en/merchant',search:{section:'redeem'}}],
  ['merchants/dashboard/insights',{pathname:'/en/merchant',search:{section:'insights'}}],
  ['merchants/dashboard/profile',{pathname:'/en/merchant',search:{section:'profile'}}],
  ['merchants/dashboard/post',{pathname:'/en/merchant',search:{section:'post'}}],
  ['merchants/dashboard/experiences',{pathname:'/en/merchant',search:{section:'experiences'}}],
  ['merchants/dashboard/experiences/new',{pathname:'/en/merchant',search:{section:'experiences',mode:'new'}}],
  ['merchants/dashboard/experiences/11111111-1111-4111-8111-111111111111/edit',{pathname:'/en/merchant',search:{section:'experiences',mode:'edit',experience:'11111111-1111-4111-8111-111111111111'}}],
  ['merchants/dashboard/experiences/11111111-1111-4111-8111-111111111111/availability',{pathname:'/en/merchant',search:{section:'experiences',mode:'availability',experience:'11111111-1111-4111-8111-111111111111'}}],
 ]);
 for(const [path,expected] of cases)assert.deepEqual(legacyEntry('/en/'+path,'GET'),expected,path);
 assert.equal(legacyEntry('/en/merchants/dashboard/experiences/not-a-uuid/edit','GET'),null);
});
