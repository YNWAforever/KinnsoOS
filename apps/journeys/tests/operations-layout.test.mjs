import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness} from './helpers/workspace-harness.mjs';

for (const locale of ['en','zh-HK']) test(`P16 ${locale} delayed long mission title cannot replace the heading above creator navigation`,async()=>{
 const id='11111111-1111-4111-8111-111111111111';let finish;
 const detail={id,title:locale==='en'?'Synthetic operations lab campaign with a long readable collaboration title':'具有完整長標題的創作者合作活動，所有文字都必須可以閱讀',summary:'Owned summary',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',eligible:true,joinAvailable:false,evidenceAvailable:false,paidFeeAmount:null,requirements:[],deliverables:[],milestones:[],submissions:[],partnerLinks:[]};
 const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{get:()=>new Promise(resolve=>finish=resolve)}},{path:'studio/missions/'+id,locale});
 const heading=h.text(h.find('h1'));
 finish({ok:true,data:detail});await new Promise(resolve=>setTimeout(resolve,0));h.render();
 assert.equal(h.text(h.find('h1')),heading,'fresh mission data must not resize the page heading above existing navigation');
 assert.ok(h.find('h2',detail.title),'the full authorized mission title remains a readable heading in its card');
 h.invalidate();assert.equal(h.text().includes(detail.title),false,'account denial still clears the private mission title');
});
