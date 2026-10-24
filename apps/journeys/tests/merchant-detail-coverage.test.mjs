import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness} from './helpers/workspace-harness.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('merchant detail identifies loaded scope separately from whole-company totals and unseen pages',async()=>{
 const detail={id,title:'Owned brief',status:'published',updatedAt:'2026-10-20T00:00:00Z',summary:'Brief',couponCode:'',couponUrl:'',affiliateRate:null,kinnsoRate:null,creatorRate:null,requiresApplication:true,scheduleTimeZone:'UTC',applicationOpensAt:null,applicationClosesAt:null,requirements:[],deliverables:[],milestones:[],participants:[],submissions:[],participantsNextCursor:'more-applications',submissionsNextCursor:null,canReviewSubmissions:true};
 const page={merchantId:id,role:'owner',items:[],nextCursor:null,branches:[],summary:{draft:0,published:55,closed:0,applications:51,activeCreators:0,submitted:0,approved:0},detail};
 const h=await workspaceHarness('MerchantCampaigns',{merchantCampaigns:{list:async()=>({ok:true,data:page})}});
 assert.match(h.text(),/Loaded detail records/);assert.match(h.text(),/55/);assert.match(h.text(),/51/);
 assert.match(h.text(),/Next applications/);assert.match(h.text(),/not the total/);
});
