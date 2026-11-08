import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';

// Regression: putting the auth branch before the capability branch must fail.
// Execute the actual workspace; only its repository and framework boundaries vary.
for(const locale of ['en','zh-HK'])for(const name of ['CreatorWorkspace','MerchantWorkspace']){
 const path=name==='CreatorWorkspace'?'studio/guides':'merchant';
 const label=(en,zh)=>locale==='en'?en:zh;
 test(`W03 ${locale} ${name}: disabled service precedes sign-in and retains public exploration`,async()=>{
  let reads=0;
  const h=await workspaceHarness(name,{request:async()=>{reads++;throw Error('Disabled service read');}},{locale,path,actorId:null,enabled:false});
  assert.match(h.text(),locale==='en'?/not connected yet/:/尚未接通/);
  assert.equal(h.find('a',label('Sign in to continue','登入後繼續')),undefined);
  assert.equal(h.find('a',label('Explore guides','探索攻略'))?.props.href,`/${locale}/explore`);
  assert.ok(h.elements().some(n=>n.props?.role==='status'));
  assert.equal(reads,0);
 });
 test(`W03 ${locale} ${name}: connected signed-out entry retains the localized return task`,async()=>{
  let reads=0;
  const h=await workspaceHarness(name,{request:async()=>{reads++;throw Error('Signed out read');}},{locale,path,actorId:null,enabled:true});
  const link=h.find('a',label('Sign in to continue','登入後繼續'));
  assert.ok(link);assert.equal(new URL(link.props.href,'https://owned.test').searchParams.get('next'),`/${locale}/${path}`);
  assert.equal(reads,0);
 });
 for(const code of ['AUTH_REQUIRED','FORBIDDEN','UNAVAILABLE'])test(`W03 ${locale} ${name}: first ${code} offers only the appropriate read recovery`,async()=>{
  const calls=[];
  const h=await workspaceHarness(name,{request:async(...args)=>{calls.push(args);return{ok:false,code,retryable:code==='UNAVAILABLE'};}},{locale,path});
  assert.equal(calls.length,1);
  const retry=h.find('button',label('Retry loading','重試載入'));
  const signIn=h.find('a',label('Sign in to continue','登入後繼續'));
  assert.ok(h.elements().some(n=>n.props?.role==='alert'));
  if(code==='AUTH_REQUIRED'){
   assert.ok(signIn);assert.equal(new URL(signIn.props.href,'https://owned.test').searchParams.get('next'),`/${locale}/${path}`);
   assert.equal(retry,undefined);
  }else if(code==='FORBIDDEN'){
   assert.equal(retry,undefined);assert.equal(signIn,undefined);
   assert.match(h.text(),locale==='en'?/access|restricted/i:/權限|存取|限制/);
  }else{
   assert.ok(retry,'first read failure must be actionable even before company selection');
   assert.equal(signIn,undefined);
   retry.props.onClick();h.render();await tick();h.render();
   assert.equal(calls.length,2);assert.ok(calls.every(args=>args[1]===undefined),'recovery performs reads only');
   assert.doesNotMatch(h.text(),/No active company|Start with your first|未獲分配|第一份創作/);
  }
 });
}
test('active creator without a published profile can author and is not told the profile is live', async () => {
 const profile = { step: 'done', profileReady: false, profilePublished: false, profile: { bio: '', niches: [], content_pillars: [], tone: [], languages: [] }, handles: [], jobStatus: null };
 const h = await workspaceHarness('CreatorWorkspace', {
  request: async (url) => url === '/api/creator/profile' ? { ok: true, data: profile } : { ok: true, data: { items: [], nextCursor: null } },
  creatorMissions: { list: async () => ({ ok: true, data: { items: [], nextCursor: null } }) },
 }, { path: 'studio', locale: 'en' });
 assert.match(h.text(), /No published creator profile is on file/);
 assert.doesNotMatch(h.text(), /profile is live|Your profile is live/i);
 assert.match(h.text(), /Start with your first authored route/);
 assert.equal(h.find('a', 'Create guide')?.props.href, '/en/studio/guides/new');
 assert.ok(h.find('button', 'Review and confirm creator profile'));
 assert.equal(h.find('button', 'Confirm creator profile'), undefined);
 const zh = await workspaceHarness('CreatorWorkspace', {
  request: async (url) => url === '/api/creator/profile' ? { ok: true, data: profile } : { ok: true, data: { items: [], nextCursor: null } },
  creatorMissions: { list: async () => ({ ok: true, data: { items: [], nextCursor: null } }) },
 }, { path: 'studio', locale: 'zh-HK' });
 assert.match(zh.text(), /尚未有已發布的創作者檔案/);
 assert.equal(zh.find('a', '建立攻略')?.props.href, '/zh-HK/studio/guides/new');
 assert.ok(zh.find('button', '核對並確認創作者檔案'));
 assert.equal(zh.find('button', '確認創作者檔案'), undefined);
});

const unpublishedProfile = { step: 'done', profileReady: false, profilePublished: false, profile: { bio: 'Draft bio', niches: ['Walking'], content_pillars: [], tone: [], languages: ['en'] }, handles: [], jobStatus: null };
function studioPorts(calls, profile = unpublishedProfile) {
 return {
  request: async (url, method, body) => {
   calls.push({ url, method: method ?? 'GET', body });
   if (url === '/api/creator/profile' && method === 'POST') return { ok: true, data: { status: 'active' } };
   if (url === '/api/creator/profile') return { ok: true, data: profile };
   return { ok: true, data: { items: [], nextCursor: null } };
  },
  creatorMissions: { list: async () => ({ ok: true, data: { items: [], nextCursor: null } }) },
 };
}
test('unpublished banner opens confirm; checkbox and request id still gate it; active status alone does not mark done', async () => {
 const calls = [];
 const h = await workspaceHarness('CreatorWorkspace', studioPorts(calls), { path: 'studio/guides', locale: 'en' });
 assert.match(h.text(), /No published creator profile is on file/);
 assert.equal(calls.filter(call => call.method === 'POST').length, 0, 'step done from an active row must not confirm');
 assert.equal(h.find('button', 'Confirm creator profile'), undefined);
 h.find('button', 'Review and confirm creator profile').props.onClick();
 h.render();
 assert.ok(h.find('button', 'Confirm creator profile'));
 assert.equal(h.find('a', 'Create guide'), undefined);
 const confirm = h.find('button', 'Confirm creator profile');
 assert.equal(confirm.props.disabled, true);
 await confirm.props.onClick();
 h.render();
 assert.equal(calls.filter(call => call.method === 'POST').length, 0);
 assert.match(h.text(), /No published creator profile is on file/);
 h.field('I have reviewed this profile and confirm publication.').props.onChange({ target: { checked: true } });
 h.render();
 const ready = h.find('button', 'Confirm creator profile');
 assert.equal(ready.props.disabled, false);
 await ready.props.onClick();
 h.render();
 const posts = calls.filter(call => call.method === 'POST');
 assert.equal(posts.length, 1);
 assert.equal(posts[0].url, '/api/creator/profile');
 assert.equal(posts[0].body.confirmed, true);
 assert.match(posts[0].body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
 assert.equal(posts[0].body.profile.bio, 'Draft bio');
 assert.doesNotMatch(h.text(), /No published creator profile is on file/);
 assert.equal(h.find('button', 'Review and confirm creator profile'), undefined);
 assert.ok(h.find('a', 'Create guide'));
});
test('leaving the confirm form does not treat an active account as a published profile', async () => {
 const calls = [];
 const h = await workspaceHarness('CreatorWorkspace', studioPorts(calls), { path: 'studio/guides', locale: 'en' });
 h.find('button', 'Review and confirm creator profile').props.onClick();
 h.render();
 h.field('I have reviewed this profile and confirm publication.').props.onChange({ target: { checked: true } });
 h.render();
 h.find('button', 'Back to guides').props.onClick();
 h.render();
 assert.equal(calls.filter(call => call.method === 'POST').length, 0);
 assert.match(h.text(), /No published creator profile is on file/);
 assert.equal(h.find('button', 'Confirm creator profile'), undefined);
 assert.ok(h.find('button', 'Review and confirm creator profile'));
 assert.ok(h.find('a', 'Create guide'));
});
test('zh-HK unpublished banner opens the same confirm form', async () => {
 const calls = [];
 const h = await workspaceHarness('CreatorWorkspace', studioPorts(calls), { path: 'studio/guides', locale: 'zh-HK' });
 assert.match(h.text(), /尚未有已發布的創作者檔案/);
 h.find('button', '核對並確認創作者檔案').props.onClick();
 h.render();
 assert.equal(h.find('button', '確認創作者檔案').props.disabled, true);
 h.field('我已核對此檔案並確認發布。').props.onChange({ target: { checked: true } });
 h.render();
 await h.find('button', '確認創作者檔案').props.onClick();
 h.render();
 const post = calls.find(call => call.method === 'POST');
 assert.equal(post.url, '/api/creator/profile');
 assert.equal(post.body.confirmed, true);
 assert.match(post.body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
 assert.doesNotMatch(h.text(), /尚未有已發布的創作者檔案/);
});
test('a profile that is already on file does not open confirm, and an in-progress confirm still needs the checkbox', async () => {
 const publishedCalls = [];
 const published = await workspaceHarness('CreatorWorkspace', studioPorts(publishedCalls, { ...unpublishedProfile, profilePublished: true }), { path: 'studio/guides', locale: 'en' });
 assert.equal(published.find('button', 'Review and confirm creator profile'), undefined);
 assert.doesNotMatch(published.text(), /No published creator profile is on file/);
 assert.equal(publishedCalls.filter(call => call.method === 'POST').length, 0);
 const calls = [];
 const reviewing = await workspaceHarness('CreatorWorkspace', studioPorts(calls, { ...unpublishedProfile, step: 'review', profileReady: true }), { path: 'studio/guides', locale: 'en' });
 assert.equal(reviewing.find('button', 'Review and confirm creator profile'), undefined);
 assert.equal(reviewing.find('button', 'Confirm creator profile').props.disabled, true);
 await reviewing.find('button', 'Confirm creator profile').props.onClick();
 reviewing.render();
 assert.equal(calls.filter(call => call.method === 'POST').length, 0);
 reviewing.field('I have reviewed this profile and confirm publication.').props.onChange({ target: { checked: true } });
 reviewing.render();
 await reviewing.find('button', 'Confirm creator profile').props.onClick();
 reviewing.render();
 assert.equal(calls.filter(call => call.method === 'POST').length, 1);
 assert.equal(calls.find(call => call.method === 'POST').body.confirmed, true);
 assert.match(calls.find(call => call.method === 'POST').body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
 assert.doesNotMatch(reviewing.text(), /No published creator profile is on file/);
 assert.ok(reviewing.find('a', 'Create guide'));
});
