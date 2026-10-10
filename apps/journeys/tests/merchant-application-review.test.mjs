import {test} from 'node:test';
import assert from 'node:assert/strict';
const review=await import('../lib/merchants/application-review.ts').catch(()=>({}));
const id='11111111-1111-4111-8111-111111111111',createdAt='2026-10-10T12:30:00.123456+00:00';

test('merchant review accepts one exact authored decision and bounds reasons before any write',()=>{
 assert.equal(typeof review.merchantApplicationDecision,'function');
 assert.deepEqual(review.merchantApplicationDecision({id,action:'approve',reason:'  Verified company website and contact  '}),{id,action:'approve',reason:'Verified company website and contact'});
 for(const input of [{id,action:'reject',reason:' '},{id,action:'approve',reason:'x'.repeat(501)},{id,action:'grantOwner',reason:'Checked'},{id:'other',action:'approve',reason:'Checked'},{id,action:'approve',reason:'Checked',userId:id}])assert.throws(()=>review.merchantApplicationDecision(input),/INVALID/);
});

test('merchant review query preserves microseconds and rejects unbounded, duplicate and mixed scopes',()=>{
 assert.equal(typeof review.merchantApplicationReviewQuery,'function');
 const cursor={createdAt,id};
 assert.deepEqual(review.merchantApplicationReviewQuery(new URLSearchParams()),{id:null,cursor:null});
 assert.deepEqual(review.merchantApplicationReviewQuery(new URLSearchParams({after:JSON.stringify(cursor)})),{id:null,cursor});
 assert.deepEqual(review.merchantApplicationReviewQuery(new URLSearchParams({id})),{id,cursor:null});
 for(const text of ['id='+id+'&id='+id,'id='+id+'&after='+JSON.stringify(cursor),'status=approved','limit=999','email=secret@example.test','after=','after='+JSON.stringify({...cursor,createdAt:createdAt+'),status.eq.approved'}),'after='+JSON.stringify({...cursor,extra:true})])assert.throws(()=>review.merchantApplicationReviewQuery(new URLSearchParams(text)),/INVALID/);
});

test('application website links permit only explicit web addresses without credentials',()=>{
 assert.equal(typeof review.applicationWebsite,'function');
 assert.equal(review.applicationWebsite('https://company.test/about'),'https://company.test/about');
 for(const value of [null,'javascript:alert(1)','data:text/html,secret','//company.test','https://user:password@company.test','https://company.test/\nprivate'])assert.equal(review.applicationWebsite(value),null);
});

test('recovery marker retains the exact bounded decision but no applicant contact or pitch and stays actor scoped',()=>{
 assert.equal(typeof review.storeApplicationReviewMarker,'function');
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const decision={id,action:'reject',reason:'Private review notes'};
 review.storeApplicationReviewMarker(storage,'actor-A',{...decision,contactEmail:'contact@example.test',pitch:'Private company pitch'});
 assert.deepEqual(review.readApplicationReviewMarker(storage,'actor-A'),decision);
 assert.equal(review.readApplicationReviewMarker(storage,'actor-B'),null);
 assert.equal([...values.values()].join('').includes('contact@example.test'),false);assert.equal([...values.values()].join('').includes('Private company pitch'),false);
 assert.throws(()=>review.storeApplicationReviewMarker(storage,'actor-B',{id,action:'approve',reason:'x'.repeat(501)}),/INVALID/);
 review.clearApplicationReviewMarker(storage,'actor-A');assert.equal(review.readApplicationReviewMarker(storage,'actor-A'),null);
 assert.throws(()=>review.storeApplicationReviewMarker({setItem(){throw Error('Blocked');}},'actor-A',decision),/Blocked/);
});
