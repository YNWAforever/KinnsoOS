import {test} from 'node:test';
import assert from 'node:assert/strict';
const intent=await import('../lib/auth/auth-intent.ts').catch(()=>({}));
const proof=await import('../lib/auth/recovery-proof.ts').catch(()=>({}));
const auth=await import('../lib/auth/return-path.ts');

test('auth intent preserves the task and locale without accepting an auth loop',()=>{
 assert.equal(typeof intent.parseAuthIntent,'function');
 assert.deepEqual(intent.parseAuthIntent(new URLSearchParams('flow=recovery&next=%2Fzh-HK%2Fg%2Fguide%3Fintent%3Dimport'),'zh-HK'),{locale:'zh-HK',flow:'recovery',next:'/zh-HK/g/guide?intent=import'});
 assert.equal(intent.parseAuthIntent(new URLSearchParams('flow=evil'),'xx').flow,'sign-in');
 for(const path of ['/en/sign-up','/zh-HK/forgot-password','/en/reset-password','/en/%73ign-up','/en/%252e%252e/g','/en/g%2f1','/en/a%5cb','/en/'+ 'a'.repeat(2048)])assert.equal(auth.safeReturnPath(path,'zh-HK'),'/zh-HK/trips',path);
});

test('recovery proof expires, rejects tampering and is bound to the current Auth session',()=>{
 assert.equal(typeof proof.createRecoveryProof,'function');
 const secret='s'.repeat(32),state={userId:'user-A',sessionId:'session-A',locale:'zh-HK',next:'/zh-HK/g/guide?intent=import'};
 const value=proof.createRecoveryProof(state,secret,1000);
 assert.deepEqual(proof.readRecoveryProof(value,secret,{userId:'user-A',sessionId:'session-A'},1001),{...state,expiresAt:1900});
 assert.equal(proof.readRecoveryProof(value,secret,{userId:'user-B',sessionId:'session-B'},1001),null);
 assert.equal(proof.readRecoveryProof(value,secret,{userId:'user-A',sessionId:'session-A'},1900),null);
 assert.equal(proof.readRecoveryProof(value+'x',secret,{userId:'user-A',sessionId:'session-A'},1001),null);
 assert.throws(()=>proof.createRecoveryProof(state,'',1000));
});

test('callback/verification failure returns to a bilingual retry with safe intent',()=>{
 assert.equal(typeof intent.authPath,'function');
 const state={locale:'zh-HK',flow:'recovery',next:'/zh-HK/g/guide?intent=import'};
 const url=new URL(intent.authPath(state,'forgot-password',{error:'expired'}),'https://return.invalid');
 assert.equal(url.pathname,'/zh-HK/forgot-password');assert.equal(url.searchParams.get('next'),state.next);assert.equal(url.searchParams.get('error'),'expired');
});

test('safe next is bounded after URL encoding and rejects DEL/C1 controls',()=>{
 for(const value of ['/en/'+ '旅'.repeat(300),'/en/%7f','/en/%C2%85'])assert.equal(auth.safeReturnPath(value,'zh-HK'),'/zh-HK/trips');
});

test('email links reuse the existing approved callback alias and preserve intent',()=>{
 const state={locale:'zh-HK',flow:'recovery',next:'/zh-HK/g/guide?intent=import'};
 const url=new URL(intent.authCallbackUrl(state,'https://kinnso-os.vercel.app'));
 assert.equal(url.pathname,'/callback');assert.equal(url.searchParams.get('next'),state.next);
 assert.equal(url.searchParams.get('flow'),'recovery');assert.equal(url.searchParams.get('locale'),'zh-HK');
});
