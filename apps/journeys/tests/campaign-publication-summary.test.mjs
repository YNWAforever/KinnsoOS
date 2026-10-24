import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness} from './helpers/workspace-harness.mjs';
const id='11111111-1111-4111-8111-111111111111';
const directory={merchantId:id,role:'owner',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0}};
for(const locale of ['en','zh-HK'])test(`publication summary ${locale}: read-only preview follows authored input and preserves unknown rates`,async()=>{
 const writes=[];
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async()=>({ok:true,data:directory}),command:async(...args)=>{writes.push(args);return{ok:false,code:'UNAVAILABLE'};}}},{locale});
 assert.match(h.text(),locale==='en'?/Publication summary/:/發布前摘要/);
 assert.match(h.text(),locale==='en'?/Not supplied/:/未提供/);
 h.field(locale==='en'?'Brief title':'簡報標題').props.onChange({target:{value:'Original authored brief'}});h.render();
 assert.match(h.text(),/Original authored brief/);
 h.field(locale==='en'?'Creator commission rate (%)':'創作者佣金比例（%）').props.onChange({target:{value:'0.70'}});h.render();
 assert.match(h.text(),/0.70%/);
 assert.match(h.text(),locale==='en'?/no fixed creator fee/:/不設固定創作者費用/);
 assert.equal(writes.length,0,'preview never writes');
});

for(const locale of ['en','zh-HK'])for(const invalid of ['date','calendar','zone'])test(`publication recovery ${locale}: invalid saved ${invalid} remains visible and correctable without a write`,async()=>{
 const writes=[],draft={title:'Recovered authored brief',summary:'Keep these original instructions',couponCode:'',couponUrl:'',affiliateRate:null,kinnsoRate:null,creatorRate:null,requirements:[],deliverables:[],milestones:[],applicationOpensAt:invalid==='date'?'invalid saved application time':invalid==='calendar'?'2030-02-30T12:00:00Z':'2030-06-01T12:00:00Z',applicationClosesAt:null,scheduleTimeZone:invalid==='zone'?'Invalid/Stored_Zone':'Asia/Hong_Kong'};
 const h=await workspaceHarness('MerchantCampaigns',{workspaceRecovery:{read:async()=>({version:1,draft:{draft,rates:['','',''],editing:null,feedback:{},branchEdits:{}},pending:null}),save:async()=>{},clear:async()=>{}},merchantCampaigns:{list:async()=>({ok:true,data:directory}),command:async(...args)=>{writes.push(args);return{ok:false,code:'UNAVAILABLE'};}}},{locale});
 assert.equal(h.field(locale==='en'?'Brief title':'簡報標題').props.value,'Recovered authored brief');
 const alert=h.elements().find(el=>el.props?.role==='alert'&&h.text(el).includes(locale==='en'?'Check the application dates and time zone.':'請核對申請日期及時區。'));
 assert.ok(alert,'invalid device schedule needs a readable correction, not a crashed editor');
 if(invalid!=='zone'){assert.equal(h.field(locale==='en'?'Applications open (UTC, optional)':'申請開始（UTC，選填）').props.value,'');assert.ok(h.text().includes(draft.applicationOpensAt),'invalid source value stays visible for correction');}
 if(invalid!=='zone')h.field(locale==='en'?'Applications open (UTC, optional)':'申請開始（UTC，選填）').props.onChange({target:{value:'2030-06-01T12:00'}});
 else h.field(locale==='en'?'Display time zone':'顯示時區').props.onChange({target:{value:'Asia/Hong_Kong'}});
 h.render();
 assert.equal(h.elements().some(el=>el.props?.role==='alert'&&h.text(el).includes(locale==='en'?'Check the application dates and time zone.':'請核對申請日期及時區。')),false);
 assert.equal(h.field(locale==='en'?'Brief title':'簡報標題').props.value,'Recovered authored brief');assert.equal(writes.length,0);
});
