import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignCommand} from '../lib/merchants/campaigns.ts';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';
const id='11111111-1111-4111-8111-111111111111';
const input={title:'Scheduled original brief',summary:'Original authored work',couponCode:'CITY',couponUrl:'https://example.test/city',affiliateRate:70,kinnsoRate:30,creatorRate:70,requirements:[],deliverables:[],milestones:[{id,title:'Original guide',description:'Authored source-backed guide',dueAt:null}]};
const command=patch=>({type:'createDraft',id,input:{...input,...patch},publish:true,reason:'Confirm schedule'});
test('campaign schedule accepts explicit UTC or offset instants and unbounded legacy input',()=>{
 for(const patch of [{},{applicationOpensAt:null,applicationClosesAt:null,scheduleTimeZone:'UTC'},{applicationOpensAt:'2026-10-12T00:00:00+08:00',applicationClosesAt:'2026-10-12T17:00:00Z',scheduleTimeZone:'Asia/Hong_Kong'},{applicationOpensAt:'2026-11-01T01:30:00-04:00',applicationClosesAt:'2026-11-01T01:30:00-05:00',scheduleTimeZone:'America/New_York'},{applicationOpensAt:'2026-10-12T00:00:00.000001Z',applicationClosesAt:'2026-10-12T00:00:00.000002Z',scheduleTimeZone:'UTC'}])assert.deepEqual(campaignCommand(command(patch)),command(patch));
});
test('campaign schedule rejects ambiguous local clocks, invalid calendar dates, zone and reversed/equal bounds',()=>{
 const valid={applicationOpensAt:'2026-10-12T00:00:00Z',applicationClosesAt:'2026-10-13T00:00:00Z',scheduleTimeZone:'Asia/Hong_Kong'};
 for(const patch of [{applicationOpensAt:'2026-10-12T00:00:00'},{applicationOpensAt:'2026-02-30T00:00:00Z'},{applicationClosesAt:valid.applicationOpensAt},{applicationClosesAt:'2026-10-11T00:00:00Z'},{scheduleTimeZone:'Missing/Zone'},{applicationOpensAt:undefined}])assert.throws(()=>campaignCommand(command({...valid,...patch})),/INVALID/);
});
test('merchant schedule fields become the saved UTC input and survive an uncertain response',async()=>{
 const writes=[];const data={merchantId:id,role:'owner',items:[],detail:null,branches:[],nextCursor:null,summary:{draft:0,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0}};
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async()=>({ok:true,data}),command:async(...args)=>{writes.push(JSON.parse(JSON.stringify(args)));return{ok:false,code:'UNAVAILABLE',retryable:true};}}});
 h.field('Brief title').props.onChange({target:{value:'Scheduled authored draft'}});h.render();
 assert.ok(h.field('Applications open (UTC, optional)'));
 h.field('Applications open (UTC, optional)').props.onChange({target:{value:'2026-10-11T16:00'}});h.render();
 h.field('Applications close (UTC, optional)').props.onChange({target:{value:'2026-10-12T16:00'}});h.render();
 h.field('Display time zone').props.onChange({target:{value:'Asia/Hong_Kong'}});h.render();
 h.elements().find(n=>n.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{submitter:{getAttribute:()=> 'draft'}}});await tick();h.render();
 assert.equal(writes[0][1].input.applicationOpensAt,'2026-10-11T16:00:00Z');assert.equal(writes[0][1].input.applicationClosesAt,'2026-10-12T16:00:00Z');assert.equal(writes[0][1].input.scheduleTimeZone,'Asia/Hong_Kong');
 await h.find('button','Retry promotion request').props.onClick();await tick();h.render();assert.deepEqual(writes[1],writes[0]);
});
