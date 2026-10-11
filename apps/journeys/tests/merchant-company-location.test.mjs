import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readListLocation,writeListLocation} from '../lib/collaboration/list-query.ts';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const companyA='11111111-1111-4111-8111-111111111111',companyB='22222222-2222-4222-8222-222222222222',campaignA='33333333-3333-4333-8333-333333333333';
function location(search,work){const previous=globalThis.window;const browser={location:{pathname:'/en/merchant',search},history:{replaceState(_state,_title,path){browser.location.search=new URL(path,'https://owned.test').search;}}};globalThis.window=browser;try{return work(browser);}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}}
test('a successfully loaded merchant detail binds the campaign URL to its company',()=>location('?view=directory',browser=>{
 writeListLocation({campaignId:campaignA,q:'City'},undefined,companyA);const query=new URLSearchParams(browser.location.search);assert.equal(query.get('company'),companyA);assert.equal(query.get('campaign'),campaignA);assert.equal(query.get('q'),'City');assert.equal(query.get('view'),'directory');
}));
test('a successful empty company directory removes the previous campaign and cursor',()=>location('?company='+companyA+'&campaign='+campaignA+'&after=v1.YWJj&view=directory',browser=>{
 writeListLocation({q:'City',sort:'deadline'},undefined,companyB);const query=new URLSearchParams(browser.location.search);assert.equal(query.get('company'),companyB);assert.equal(query.has('campaign'),false);assert.equal(query.has('after'),false);assert.equal(query.get('q'),'City');assert.equal(query.get('view'),'directory');
}));
test('another company or duplicate company location cannot restore an opaque merchant cursor',()=>{
 for(const scope of ['company='+companyA,'company='+companyB+'&company='+companyB])location('?'+scope+'&q=City&status=published&sort=deadline&after=v1.YWJj',()=>{
  assert.deepEqual(readListLocation('merchant',companyB),{q:'City',status:'published',sort:'deadline'});
 });
});
test('same-company and legacy unscoped reads preserve their cursor; malformed filters still fail',()=>{
 for(const scope of ['','company='+companyA+'&'])location('?'+scope+'q=City&after=v1.YWJj',()=>assert.deepEqual(readListLocation('merchant',companyA),{q:'City',after:'v1.YWJj'}));
 location('?company='+companyA+'&q=a&q=b&after=v1.YWJj',()=>assert.throws(()=>readListLocation('merchant',companyB),/INVALID/));
 location('?company='+companyA+'&scope=mine&after=v1.YWJj',()=>assert.deepEqual(readListLocation('mine'),{after:'v1.YWJj'}));
});
for(const locale of ['en','zh-HK'])test('actual '+locale+' merchant component switches to an empty authorized company without reading the previous campaign',async()=>{
 const reads=[],writes=[],denials=[];
 const directory={items:[],nextCursor:null,summary:{},branches:[],role:'marketing',detail:null};
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async(id,query)=>{reads.push({id,query});if(id===companyB&&query.campaignId===campaignA)return{ok:false,code:'FORBIDDEN'};return{ok:true,data:directory};},command:async(...args)=>{writes.push(args);return{ok:true};}}},{locale,merchantId:companyA,search:'?campaign='+campaignA+'&after=v1.YWJj',recordLocation:true,onDenied:code=>denials.push(code)});
 h.field(locale==='en'?'Brief title':'簡報標題').props.onChange({target:{value:'Private draft A'}});h.render();
 h.props.merchantId=companyB;h.render();for(let n=0;n<5;n++){await tick();h.render();}
 const forB=reads.filter(call=>call.id===companyB);assert.ok(forB.length>0);assert.equal(forB.some(call=>call.query.campaignId===campaignA),false,'company B must not inherit the campaign UUID from A');assert.equal(forB.some(call=>call.query.after!==undefined),false,'company B must not inherit an opaque cursor from A');assert.deepEqual(denials,[]);assert.deepEqual(writes,[]);
 assert.equal(h.field(locale==='en'?'Brief title':'簡報標題')?.props.value,'');assert.equal(h.location().get('company'),companyB);assert.equal(h.location().has('campaign'),false);assert.ok(!h.text().includes('Private draft A'));
});
