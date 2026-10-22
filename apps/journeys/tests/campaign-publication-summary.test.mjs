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
