import {test} from 'node:test';import assert from 'node:assert/strict';import {discoveryModule} from './helpers/discovery-load.mjs';
import {discoveryOffers} from '../../../docs/prototypes/conversation-studio-local/discovery-data.mjs';
import {backend,publishedFixture,cmd,company} from './helpers/discovery-fixture.mjs';
const p=await discoveryModule('offers');
const now=new Date('2026-11-01T04:00:00Z');
async function sample(){const fields=(await discoveryOffers(()=>+now))[0];const imported={id:'i',linkId:'l',externalOfferId:fields.offerId,sourceRevision:1,sourceHash:fields.hash,appliedLocationId:'location-a',sourceLocationId:'location-a',observedAt:fields.observedAt,sourceScopeVersion:1,fields};const input={importId:'i',cityKey:'city:hk:hong-kong',dateTimeZone:'Asia/Hong_Kong',priceBasis:'per_person',interestTags:['散步'],languages:['zh-HK'],audiences:['traveller','creator'],displayFields:['title','details','terms']};const current={id:'p',companyId:'c',revision:1,contentVersion:0,status:'draft'};return {input,current,offerImport:imported,companyId:'c',role:'owner',now};}
test('offer policy exists',()=>assert.equal(typeof p.preparePublication,'function'));
test('confirmed_is_not_published; marketing_cannot_create_new_publication',async()=>{
 const c=await sample(),pub=await p.preparePublication(c.input,c);assert.equal(pub.status,'draft');assert.equal(pub.contentVersion,1);
 await assert.rejects(()=>p.preparePublication(c.input,{...c,role:'marketing'}),/FORBIDDEN/);
 assert.equal(p.validatePublication({contentVersion:1,previewDigest:pub.previewDigest,confirmed:true},{publication:pub,grants:[],sourceCurrent:true,now}).allowed,false);
});
test('catalog grant is not public guide; publishing does not invalidate content grants; purpose revoke independent',async()=>{
 const c=await sample(),pub=await p.preparePublication(c.input,c),g={id:'g',publicationId:pub.id,publicationContentVersion:1,grantVersion:1,contentHash:pub.contentHash,purpose:'catalog',verificationState:'approved',allowedFields:pub.displayFields,expiresAt:'2027-02-01T00:00:00Z',revokedAt:null};
 const source={publicationId:pub.id,contentVersion:1,contentHash:pub.contentHash,grantRefs:[{purpose:'catalog',id:'g',version:1}]};
 assert.equal(p.checkContentGrant(g,source,'public_guide',now).allowed,false);assert.equal(p.checkContentGrant(g,source,'catalog',now).allowed,true);
 const match={...g,id:'gm',purpose:'matching'};assert.equal(p.validatePublication({contentVersion:1,previewDigest:pub.previewDigest,confirmed:true},{publication:{...pub,revision:10},grants:[g,match],sourceCurrent:true,now}).allowed,true);
 assert.equal(p.checkContentGrant({...g,revokedAt:now.toISOString()},source,'catalog',now).allowed,false);
 assert.equal(p.checkContentGrant(match,{...source,grantRefs:[{purpose:'matching',id:'gm',version:1}]},'matching',now).allowed,true);
});
test('changed_source_invalidates_preview; published content cannot be overwritten',async()=>{
 const c=await sample(),pub=await p.preparePublication(c.input,c);
 assert.equal(p.validatePublication({contentVersion:1,previewDigest:pub.previewDigest,confirmed:true},{publication:pub,grants:[],sourceCurrent:false,now}).reason,'SOURCE_CHANGED');
 await assert.rejects(()=>p.preparePublication(c.input,{...c,current:{...pub,status:'published'}}),/CONFLICT/);
});
test('same_source_revision_different_hash_is_blocked; workspace offer independent per location',()=>{
 const a={linkId:'l',externalOfferId:'a',sourceRevision:1,appliedLocationId:'x',sourceHash:'hash'};
 assert.equal(p.importKey(a),p.importKey({...a}));assert.notEqual(p.importKey(a),p.importKey({...a,appliedLocationId:'y'}));
 assert.throws(()=>p.assertSameImport(a,{...a,sourceHash:'changed'}),/SOURCE_CHANGED/);
});
test('publication writer exists',()=>assert.equal(typeof backend,'function'));
test('withdraw_hides_new_reads; grant command retries are idempotent',async()=>{
 const {b,publicationId}=await publishedFixture();let d=(await b.read({kind:'companyOffers',companyId:company})).data;assert.equal(d.grants.length,6);assert.equal(d.publications[0].status,'published');
 const c=cmd('withdrawOffer',publicationId,{},d.publications[0].revision);assert.equal((await b.command(c)).ok,true);assert.equal((await b.command(c)).ok,true);
 d=(await b.read({kind:'companyOffers',companyId:company})).data;assert.ok(d.grants.every(g=>g.revokedAt));assert.equal(d.publications[0].contentVersion,1);
});

test('review: owner revocation during source refresh prevents installing new grants',async()=>{
 let clock=+now,role='owner';const {b,publicationId}=await publishedFixture({now:()=>clock,membership:()=>({role})});
 const before=b.context(publicationId),p=before.publication;clock+=61000;
 let release,started;const waiting=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;}),original=b.sme.validateRefs;
 b.sme.validateRefs=async(...args)=>{started();await gate;return original(...args);};
 const result=b.command(cmd('grantContentUse',p.id,{publicationContentVersion:p.contentVersion,allowedFields:p.displayFields,purposes:['private_brief'],expiresAt:'2027-02-01T00:00:00Z',rightsBasisRef:'fixture:original:kinnso-discovery-v1',previewDigest:p.previewDigest,confirmed:true},p.revision));
 await waiting;role='marketing';release();assert.equal((await result).code,'FORBIDDEN');assert.deepEqual(b.context(publicationId).grants,before.grants);
});
