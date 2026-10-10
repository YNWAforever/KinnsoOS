import {test} from 'node:test';
import assert from 'node:assert/strict';
const mailbox = await import('../scripts/local-auth-mailbox.mjs').catch(() => ({}));
const project = 'kinnsoos-b1-20261002';
const env = () => ({KINNSO_TEST_TARGET:'local', KINNSO_TEST_PROJECT:project, KINNSO_TEST_API_ORIGIN:'http://127.0.0.1:58421', KINNSO_TEST_DB_CONTAINER:'supabase_db_'+project, SUPABASE_URL:'http://127.0.0.1:58421', KINNSO_TEST_MAILBOX_ORIGIN:'http://127.0.0.1:58424', KINNSO_TEST_EMAIL_CONFIRMATION:'required'});
const container = (service, entries=[]) => ({Name:'/supabase_'+service+'_'+project, State:{Running:true}, Config:{Labels:{'com.supabase.cli.project':project}, Env:entries}});
const email = 'synthetic-mailbox-owned@example.test';
const intent = {locale:'zh-HK', flow:'sign-up', next:'/zh-HK/trips?intent=import'};
const link = (changes={}) => {
 const redirect = new URL('http://127.0.0.1:3495/callback');
 redirect.search = new URLSearchParams(intent).toString();
 const url = new URL('http://127.0.0.1:58421/auth/v1/verify');
 url.search = new URLSearchParams({token:'DO_NOT_PRINT_TOKEN', type:'signup', redirect_to:redirect.href, ...changes}).toString();
 return url.href;
};
const message = (href=link()) => ({To:[{Address:email}], HTML:'<a href="'+href.replaceAll('&','&amp;')+'">Confirm</a>'});

test('mailbox target and container guards require owned local SMTP capture and enabled confirmation', () => {
 assert.equal(typeof mailbox.verifyMailboxRuntime, 'function');
 const auth = container('auth', ['GOTRUE_MAILER_AUTOCONFIRM=false', 'GOTRUE_SMTP_HOST=supabase_inbucket_'+project, 'GOTRUE_SMTP_PORT=1025']);
 assert.equal(mailbox.verifyMailboxRuntime(env(), auth, container('inbucket')).mailboxOrigin, 'http://127.0.0.1:58424');
 for (const changed of [{...env(),KINNSO_TEST_MAILBOX_ORIGIN:'https://external.example'}, {...env(),KINNSO_TEST_EMAIL_CONFIRMATION:'optional'}]) assert.throws(() => mailbox.verifyMailboxRuntime(changed,auth,container('inbucket')));
 for (const bad of [container('auth', ['GOTRUE_MAILER_AUTOCONFIRM=true']), {...auth,State:{Running:false}}, {...auth,Config:{...auth.Config,Labels:{'com.supabase.cli.project':'other'}}}]) assert.throws(() => mailbox.verifyMailboxRuntime(env(),bad,container('inbucket')));
 assert.throws(() => mailbox.verifyMailboxRuntime(env(),auth,container('inbucket',['MP_SMTP_RELAY_CONFIG=external'])));
});
test('recipient-scoped selection never falls back to latest or a different recipient', () => {
 assert.equal(typeof mailbox.selectCapturedMessage, 'function');
 const record = {ID:'owned-message-id',To:[{Address:email}]};
 assert.equal(mailbox.selectCapturedMessage({messages:[{...record,To:[{Address:'other@example.test'}]},record]}, email), 'owned-message-id');
 assert.equal(mailbox.selectCapturedMessage({messages:[]},email), null);
 for (const input of [{messages:[{...record,ID:'../latest'}]}, {messages:[record,record]}, {messages:[{...record,To:[{Address:email},{Address:'other@example.test'}]}]}]) assert.throws(() => mailbox.selectCapturedMessage(input,email));
 assert.throws(() => mailbox.selectCapturedMessage({messages:[]},'real-person@example.com'));
});
test('captured links are bounded and bind the exact recipient, Auth origin, callback, flow, locale and original task', () => {
 assert.equal(typeof mailbox.capturedConfirmationLink,'function');
 assert.equal(mailbox.capturedConfirmationLink(message(),email,intent,env()),link());
 const badRedirects = ['https://evil.example/auth/callback', 'http://127.0.0.1:3495/auth/callback', 'http://127.0.0.1:3495/auth/callback?locale=en&flow=sign-up&next=/en/trips'];
 for (const redirect_to of badRedirects) assert.throws(() => mailbox.capturedConfirmationLink(message(link({redirect_to})),email,intent,env()));
 for (const bad of [message(link({type:'recovery'})), message(link().replace('58421','54321')), {...message(),To:[{Address:'other@example.test'}]}, {...message(),HTML:'x'.repeat(32769)}, {...message(),HTML:message().HTML.repeat(2)}]) {
  let failure;try{mailbox.capturedConfirmationLink(bad,email,intent,env());}catch(error){failure=error;}
  assert.ok(failure); assert.equal(String(failure).includes('DO_NOT_PRINT_TOKEN'),false);
 }
});