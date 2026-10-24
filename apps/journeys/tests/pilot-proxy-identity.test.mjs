import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotProxyConfigured,pilotProxyHeaders,pilotProxyIdentity} from '../lib/telemetry/pilot-proxy.ts';
const env={KINNSO_PILOT_PROXY_SECRET:Buffer.alloc(32,7).toString('base64url')};
const now=1760000000000,origin='https://planner.example',body='{"phase":"guide_viewed"}';
const request=headers=>new Request(origin+'/api/telemetry/pilot',{method:'POST',headers,body});
test('direct native requests need no proxy key and cannot accidentally become verified',()=>{
 assert.deepEqual(pilotProxyIdentity(request({}),body,{},now),{kind:'direct'});
 assert.deepEqual(pilotProxyIdentity(request({'x-kinnso-pilot-proxy-ip':''}),body,env,now),{kind:'invalid'});
});
for(const ip of ['198.51.100.10','2001:db8::10'])test('valid signed visitor identity survives an unrelated egress IP: '+ip,()=>{
 const signed=pilotProxyHeaders(ip,origin,body,env,now);assert.ok(signed);
 const r=request({...signed,'x-vercel-forwarded-for':'198.51.100.200'});
 assert.deepEqual(pilotProxyIdentity(r,body,env,now),{kind:'verified',ip});
 assert.deepEqual(pilotProxyIdentity(r,body+' ',env,now),{kind:'invalid'});
});
for(const seconds of [-60,0,60])test('freshness boundary accepts a genuinely signed allowed clock skew: '+seconds,()=>{
 const h=pilotProxyHeaders('198.51.100.10',origin,body,env,now+seconds*1000);
 assert.deepEqual(pilotProxyIdentity(request(h),body,env,now),{kind:'verified',ip:'198.51.100.10'});
});
for(const seconds of [-61,61])test('valid signature outside the clock bound is rejected: '+seconds,()=>{
 const h=pilotProxyHeaders('198.51.100.10',origin,body,env,now+seconds*1000);
 assert.deepEqual(pilotProxyIdentity(request(h),body,env,now),{kind:'invalid'});
});
test('key mismatch fails closed; deliberate two-end key rotation keeps the same quota identity',()=>{
 const second={KINNSO_PILOT_PROXY_SECRET:Buffer.alloc(32,8).toString('base64url')};
 const firstHeaders=pilotProxyHeaders('198.51.100.10',origin,body,env,now);
 assert.deepEqual(pilotProxyIdentity(request(firstHeaders),body,second,now),{kind:'invalid'});
 const secondHeaders=pilotProxyHeaders('198.51.100.10',origin,body,second,now);
 assert.deepEqual(pilotProxyIdentity(request(secondHeaders),body,second,now),{kind:'verified',ip:'198.51.100.10'});
});
for(const key of ['', 'short', 'a'.repeat(42), 'a'.repeat(43), 'a'.repeat(44)])test('only a canonical 32-byte server key enables signing: '+key.length,()=>{
 const bad={KINNSO_PILOT_PROXY_SECRET:key};assert.equal(pilotProxyConfigured(bad),false);
 assert.equal(pilotProxyHeaders('198.51.100.10',origin,body,bad,now),null);
});
test('signer cannot create an ambiguous or unbounded visitor identity',()=>{
 for(const ip of ['unknown','','198.51.100.10,198.51.100.11','not-an-ip'])assert.equal(pilotProxyHeaders(ip,origin,body,env,now),null);
 assert.equal(pilotProxyHeaders('198.51.100.10',origin,body,env,NaN),null);
});
