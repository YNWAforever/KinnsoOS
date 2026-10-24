import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capabilities} from '../lib/contracts/capabilities.ts';
const crypto=await import('../lib/trips/share-receipt-crypto.ts').catch(()=>({}));
const ctx={actorId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',tripId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222'};
const a=Buffer.alloc(32,41).toString('base64'),b=Buffer.alloc(32,92).toString('base64');
const env={KINNSO_SHARE_RECEIPT_ACTIVE_KEY:'first',KINNSO_SHARE_RECEIPT_KEYS:JSON.stringify({first:a})};
const base={KINNSO_ENVIRONMENT:'local',KINNSO_SUPABASE_URL:'http://127.0.0.1:58421',KINNSO_APPROVED_SUPABASE_ORIGIN:'http://127.0.0.1:58421',KINNSO_LEGACY_AUTH_ORIGIN:'http://127.0.0.1:58421',KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',KINNSO_ENABLED_CAPABILITIES:'sharing'};
const token='ac'.repeat(32);
test('new recovery configuration gates minting without disabling legacy owned link management',()=>{
 assert.equal(capabilities(base).sharing.mode,'connected');assert.equal(capabilities(base).shareRecovery?.mode,'unavailable');
 const value=capabilities({...base,...env});assert.equal(value.shareRecovery?.mode,'connected');assert.equal(value.shareRecovery.session,true);assert.equal(value.shareRecovery.visibility,'private');assert.equal(JSON.stringify(value).includes(a),false);
 assert.equal(capabilities({...base,...env,KINNSO_ENABLED_CAPABILITIES:''}).shareRecovery.mode,'unavailable');
 for(const invalid of ['', '{}','[]',JSON.stringify({first:'bad'}),JSON.stringify({first:Buffer.alloc(31).toString('base64')})])assert.equal(capabilities({...base,...env,KINNSO_SHARE_RECEIPT_KEYS:invalid}).shareRecovery.mode,'unavailable');
 assert.equal(capabilities({...base,...env,KINNSO_SHARE_RECEIPT_ACTIVE_KEY:'missing'}).shareRecovery.mode,'unavailable');
});
test('encrypted token receipt round trips with fresh IV, no raw token and bound actor/trip/request',()=>{
 assert.equal(typeof crypto.sealShareToken,'function');
 const one=crypto.sealShareToken(token,ctx,env),two=crypto.sealShareToken(token,ctx,env);
 assert.equal(JSON.stringify(one).includes(token),false);assert.notEqual(one.iv,two.iv);assert.equal(crypto.recoverShareToken(one,ctx,env),token);
 for(const key of ['actorId','tripId','requestId'])assert.throws(()=>crypto.recoverShareToken(one,{...ctx,[key]:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},env));
});
test('tampered or malformed receipts fail closed without a replacement token',()=>{
 assert.equal(typeof crypto.sealShareToken,'function');const one=crypto.sealShareToken(token,ctx,env);
 for(const bad of [{...one,tag:'00'.repeat(16)},{...one,ciphertext:'00'.repeat(64)},{...one,iv:'x'},{...one,kid:'missing'},{...one,v:2},{...one,unexpected:'private'},null])assert.throws(()=>crypto.recoverShareToken(bad,ctx,env));
 assert.throws(()=>crypto.sealShareToken('short',ctx,env));assert.throws(()=>crypto.sealShareToken(token,{...ctx,actorId:'unknown'},env));
});
test('rotation recovers old receipts only while their key is retained',()=>{
 assert.equal(typeof crypto.sealShareToken,'function');const one=crypto.sealShareToken(token,ctx,env),rotated={KINNSO_SHARE_RECEIPT_ACTIVE_KEY:'next',KINNSO_SHARE_RECEIPT_KEYS:JSON.stringify({first:a,next:b})};
 assert.equal(crypto.recoverShareToken(one,ctx,rotated),token);assert.equal(crypto.sealShareToken(token,ctx,rotated).kid,'next');assert.throws(()=>crypto.recoverShareToken(one,ctx,{...rotated,KINNSO_SHARE_RECEIPT_KEYS:JSON.stringify({next:b})}));
});

test('existing database UUID versions remain usable in bound receipt contexts',()=>{const legacy={...ctx,tripId:'cc08a943-52fc-94e8-5310-e0965d7d0fcb'};const e=crypto.sealShareToken(token,legacy,env);assert.equal(crypto.recoverShareToken(e,legacy,env),token);});
