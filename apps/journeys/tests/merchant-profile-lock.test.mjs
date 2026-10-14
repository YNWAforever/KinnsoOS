import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const profile={companyName:'Owned company',contactName:'Owner',contactEmail:'owner@example.test',websiteUrl:'',tagline:'',city:'',logoUrl:'',updatedAt:'2026-10-12T00:00:00Z'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const flush=async h=>{await tick();h.render();};
test('W05: initial and discard profile reads never lock unrelated company forms',async()=>{
 const pending=[],locks=[];const h=await workspaceHarness('MerchantProfile',{merchantOnboarding:{profile:()=>{const p=deferred();pending.push(p);return p.promise;}}},{onLockChange:value=>locks.push(value)});
 assert.equal(locks.at(-1),false,'late profile loading must not disable an already focused invitation');
 pending.shift().resolve({ok:true,data:profile});await flush(h);
 h.field('Company introduction').props.onChange({target:{value:'Owned draft'}});h.render();
 h.find('button','Discard edits and reload').props.onClick();h.render();
 assert.equal(h.elements().find(n=>n.type==='fieldset').props.disabled,true,'the profile itself remains read-locked');
 assert.equal(locks.at(-1),false,'discard reload does not lock unrelated forms');
 pending.shift().resolve({ok:true,data:profile});await flush(h);assert.equal(h.field('Company introduction').props.value,'');
});
test('W05: profile write and unknown receipt retain the company lock until the same request is confirmed',async()=>{
 const locks=[],writes=[],pending=[];const h=await workspaceHarness('MerchantProfile',{merchantOnboarding:{profile:async()=>({ok:true,data:profile}),save:(...args)=>{writes.push(structuredClone(args));const p=deferred();pending.push(p);return p.promise;}}},{onLockChange:value=>locks.push(value)});
 h.field('Company introduction').props.onChange({target:{value:'Owned revision'}});h.render();
 const submit=()=>{h.elements().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();};submit();
 assert.equal(locks.at(-1),true);assert.equal(h.elements().find(n=>n.type==='fieldset').props.disabled,true);
 pending.shift().resolve({ok:false,code:'UNAVAILABLE'});await flush(h);assert.equal(locks.at(-1),true,'unknown write blocks company changes');
 submit();assert.equal(locks.at(-1),true);assert.deepEqual(writes[1],writes[0],'retry must preserve scope, payload, CAS and request ID');
 pending.shift().resolve({ok:true,data:{...profile,tagline:'Owned revision',updatedAt:'2026-10-12T01:00:00Z'}});await flush(h);
 assert.equal(locks.at(-1),false);assert.equal(h.field('Company introduction').props.value,'Owned revision');
});
test('W05: switching company during an unlocked profile read ignores its late response and actor invalidation removes private fields',async()=>{
 const pending=[],locks=[];const h=await workspaceHarness('MerchantProfile',{merchantOnboarding:{profile:id=>{const p=deferred();pending.push({id,...p});return p.promise;}}},{merchantId:first,onLockChange:value=>locks.push(value)});
 assert.equal(locks.at(-1),false);h.props.merchantId=second;h.render();assert.deepEqual(pending.map(x=>x.id),[first,second]);
 pending[0].resolve({ok:true,data:{...profile,companyName:'Old private company'}});await flush(h);assert.doesNotMatch(h.text(),/Old private company/);assert.equal(h.field('Company introduction'),undefined);
 pending[1].resolve({ok:true,data:{...profile,companyName:'Current company'}});await flush(h);assert.equal(h.field('Company name').props.value,'Current company');
 h.invalidate();assert.equal(h.field('Company name'),undefined);assert.match(h.text(),/Current owner access is required/);
});
