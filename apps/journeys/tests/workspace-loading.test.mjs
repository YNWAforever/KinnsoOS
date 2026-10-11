import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
for(const locale of ['en','zh-HK'])test(`P16 ${locale}: first campaign read holds the editor; unavailable read retries without a command`,async()=>{
 let finish;const calls=[],writes=[];
 const directory={merchantId:'11111111-1111-4111-8111-111111111111',role:'marketing',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,applications:0,activeCreators:0,submitted:0,approved:0}};
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:(...args)=>{calls.push(args);return new Promise(done=>finish=done);},command:(...args)=>{writes.push(args);throw Error('Unexpected write');}}},{locale});
 assert.equal(h.field(locale==='en'?'Brief title':'簡報標題'),undefined,'first read must complete before painting the editor below private next actions');
 assert.ok(h.text().includes(locale==='en'?'Loading promotions':'正在載入推廣'));
 finish({ok:false,code:'UNAVAILABLE',requestId:'22222222-2222-4222-8222-222222222222'});await tick();h.render();
 assert.equal(h.field(locale==='en'?'Brief title':'簡報標題'),undefined,'recoverable first-read failure must keep the unauthorised editor absent');
 const retry=h.find('button',locale==='en'?'Retry loading':'重試載入');assert.ok(retry,'first read failure still exposes the existing recovery action');retry.props.onClick();h.render();
 finish({ok:true,data:directory});await tick();h.render();assert.equal(calls.length,2);assert.deepEqual(writes,[]);
 const title=h.field(locale==='en'?'Brief title':'簡報標題');assert.ok(title);title.props.onChange({target:{value:'Retained original draft'}});h.render();
 h.find('button',locale==='en'?'Reload promotion':'重新載入推廣').props.onClick();h.render();assert.equal(h.field(locale==='en'?'Brief title':'簡報標題').props.value,'Retained original draft','a subsequent slow read must not unmount the authored editor');
 finish({ok:true,data:directory});await tick();h.render();assert.equal(h.field(locale==='en'?'Brief title':'簡報標題').props.value,'Retained original draft');assert.deepEqual(writes,[]);
 h.find('button',locale==='en'?'Reload promotion':'重新載入推廣').props.onClick();h.render();finish({ok:false,code:'UNAVAILABLE'});await tick();h.render();
 h.find('button',locale==='en'?'Retry loading':'重試載入').props.onClick();h.render();assert.equal(h.field(locale==='en'?'Brief title':'簡報標題').props.value,'Retained original draft','after an authorized read, outage/retry must keep the authored editor mounted');
 finish({ok:true,data:directory});await tick();h.render();assert.deepEqual(writes,[]);
 h.props.merchantId='33333333-3333-4333-8333-333333333333';h.render();assert.equal(h.field(locale==='en'?'Brief title':'簡報標題'),undefined,'another company requires its own first scoped read');
 h.invalidate();assert.equal(h.field(locale==='en'?'Brief title':'簡報標題'),undefined);
});

for(const locale of ['en','zh-HK'])for(const initial of ['invalid-url','invalid-response'])test(`P03 ${locale}: first ${initial} can load a fresh scoped directory without exposing the editor`,async()=>{
 const reads=[],writes=[];let finish;
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:(...args)=>{reads.push(args);return new Promise(done=>finish=done);},command:(...args)=>{writes.push(args);throw Error('Unexpected write');}}},{locale,search:initial==='invalid-url'?'?campaign=11111111-1111-4111-8111-111111111111&status=bogus':'',recordLocation:true});
 if(initial==='invalid-response'){finish({ok:false,code:'INVALID'});await tick();h.render();}else assert.equal(reads.length,0);
 assert.equal(h.field(locale==='en'?'Brief title':'簡報標題'),undefined);
 const reload=h.find('button',locale==='en'?'Reload promotion':'重新載入推廣');assert.ok(reload,'invalid first reads need an actionable fresh read, not an absent input form');assert.notEqual(reload.props.disabled,true);reload.props.onClick();h.render();
 assert.deepEqual(JSON.parse(JSON.stringify(reads.at(-1))),[h.props.merchantId,{}]);assert.equal(h.field(locale==='en'?'Brief title':'簡報標題'),undefined);
 finish({ok:true,data:{merchantId:h.props.merchantId,role:'marketing',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,applications:0,activeCreators:0,submitted:0,approved:0}}});await tick();h.render();assert.ok(h.field(locale==='en'?'Brief title':'簡報標題'));assert.equal(h.location().get('status'),null);assert.deepEqual(writes,[]);
});
