import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createExampleProvider} from './provider.mjs';
const now=Date.parse('2026-11-01T06:00:00Z');
const link={companyId:randomUUID(),workspaceId:'example-workspace',locationIds:['A1'],readRefreshAllowed:true,scopeVersion:1};
async function fixture(){return createExampleProvider({runId:randomUUID(),clock:()=>now,link});}
test('fixture proof validates signature, issuer, audience, expiry and revocation in memory',async()=>{const f=await fixture(),proof=f.issueOwnerProof({nonce:'n'.repeat(43),companyBindingHash:'a'.repeat(64)});const p=await f.providers.verifyOwnerProof(proof);assert.equal(p.role,'owner');assert.deepEqual(p.locationIds,['A1']);await assert.rejects(f.providers.verifyOwnerProof(proof+'x'));f.revokeProof(proof);await assert.rejects(f.providers.verifyOwnerProof(proof));});
test('proof from a different run, changed scope or expired time cannot authorize',async()=>{let clock=now;const a=await createExampleProvider({runId:randomUUID(),clock:()=>clock,link}),b=await fixture(),proof=a.issueOwnerProof({nonce:'n'.repeat(43),companyBindingHash:'a'.repeat(64)});await assert.rejects(b.providers.verifyOwnerProof(proof));clock=now+60000;await assert.rejects(a.providers.verifyOwnerProof(proof));clock=now;a.changeScope(2);await assert.rejects(a.providers.verifyOwnerProof(proof));});
test('merchant evidence is example-only and unknown price is null, not zero',async()=>{const f=await fixture(),result=await f.providers.sme.call('sme_offer_evidence_v1',{offerId:f.offer.offerId,expectedRevision:1,locationId:'A1'},link);assert.equal(result.data.priceAmount,null);assert.equal(result.data.rightsState,'unverified_for_kinnso_reuse');assert(result.data.details.includes('EXAMPLE_ONLY'));assert.equal(f.audit().length,1);});
test('reference validation sends no prose or trip intent and returns actual source state',async()=>{const f=await fixture();f.setSourceState('changed');const ref={offerId:f.offer.offerId,revision:1,hash:f.offer.hash,locationId:'A1'};const r=await f.providers.sme.call('sme_validate_offer_refs_v1',{refs:[ref]},link);assert.equal(r.data.items[0].state,'changed');await assert.rejects(f.providers.sme.call('sme_validate_offer_refs_v1',{refs:[ref],tripIntent:'private'},link));assert(!JSON.stringify(f.audit()).includes('private'));});
test('foreign company, workspace, location or absent consent never receives evidence',async()=>{const f=await fixture();for(const delta of [{companyId:randomUUID()},{workspaceId:'foreign'},{locationIds:['B1']},{readRefreshAllowed:false}])await assert.rejects(f.providers.sme.call('sme_offer_evidence_v1',{offerId:f.offer.offerId,expectedRevision:1,locationId:'A1'},{...link,...delta}));assert.equal(f.audit().length,0);});
test('no arbitrary tools or HTTP transport; provider audit stores metadata only',async()=>{const f=await fixture();await assert.rejects(f.providers.sme.call('send_email',{},link));assert.equal('fetch' in f.providers,false);const a=await f.providers.key(),b=await f.providers.key();a.secret[0]^=255;assert.notDeepEqual(a.secret,b.secret);});
test('noncanonical signature aliases cannot bypass revoked fixture proof identity',async()=>{
 const f=await fixture(),proof=f.issueOwnerProof({nonce:'n'.repeat(43),companyBindingHash:'a'.repeat(64)}),parts=proof.split('.');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',signature=parts[2];
 const alternate=signature.slice(0,-1)+alphabet[alphabet.indexOf(signature.at(-1))+1];
 assert.deepEqual(Buffer.from(signature,'base64url'),Buffer.from(alternate,'base64url'));
 f.revokeProof(proof);await assert.rejects(f.providers.verifyOwnerProof(parts[0]+'.'+parts[1]+'.'+alternate),{message:'RESTRICTED'});
});
