import test from 'node:test';
import assert from 'node:assert/strict';
let actions={};
try{actions=await import('../lib/ops/content-actions.ts');}catch{}
const id='11111111-1111-4111-8111-111111111111';
const startsAt='2026-11-20T10:00:00.000Z';

test('session administration validates an exact safe creation envelope',()=>{
 assert.equal(typeof actions.parseOpsContentAction,'function');
 const session={action:'createSession',locale:'en',requestId:id,hostCreatorId:'22222222-2222-4222-8222-222222222222',title:'Synthetic admin session',description:'Synthetic session description',type:'destination_briefing',startsAt,durationMinutes:45,embedUrl:'https://www.youtube.com/watch?v=abc123',replayUrl:'',destinationTags:['Tokyo']};
 assert.deepEqual(actions.parseOpsContentAction(session),session);
 assert.deepEqual(actions.parseOpsContentAction({action:'setSessionStatus',locale:'en',id,status:'cancelled'}),{action:'setSessionStatus',locale:'en',id,status:'cancelled'});
 for(const value of [
  {...session,type:'unknown'},
  {...session,startsAt:'bad'},
  {...session,embedUrl:'https://foreign.test/video'},
  {...session,destinationTags:['x'.repeat(41)]},
  {...session,actorId:'foreign'},
 ])assert.throws(()=>actions.parseOpsContentAction(value),/INVALID_OPS_CONTENT/);
});

test('perk and testimonial administration rejects financial or injected fields',()=>{
 const perk={action:'createPerk',locale:'en',requestId:id,partnerName:'Synthetic Partner',title:'Synthetic perk',summary:'Synthetic perk summary',category:'travel',discountLabel:'10%',minTier:'rising',redemptionType:'code',redemptionValue:'SYNTHETIC',sortOrder:10,active:false};
 assert.deepEqual(actions.parseOpsContentAction(perk),perk);
 assert.deepEqual(actions.parseOpsContentAction({action:'setPerkActive',locale:'en',id,active:true}),{action:'setPerkActive',locale:'en',id,active:true});
 const testimonial={action:'createTestimonial',locale:'en',requestId:id,quote:'Synthetic verified testimonial',authorName:'Synthetic Person',authorRole:'creator',contentLocale:'en',sortOrder:5};
 assert.deepEqual(actions.parseOpsContentAction(testimonial),testimonial);
 assert.deepEqual(actions.parseOpsContentAction({action:'setTestimonialStatus',locale:'en',id,status:'published'}),{action:'setTestimonialStatus',locale:'en',id,status:'published'});
 for(const value of [
  {...perk,redemptionType:'link',redemptionValue:'javascript:alert(1)'},
  {...perk,minTier:'enterprise'},
  {...perk,amount:100},
  {...testimonial,authorRole:'admin'},
  {...testimonial,status:'published'},
 ])assert.throws(()=>actions.parseOpsContentAction(value),/INVALID_OPS_CONTENT/);
});

test('enquiry status transitions remain bounded to the audited RPC vocabulary',()=>{
 assert.deepEqual(actions.parseOpsContentAction({action:'setEnquiryStatus',locale:'en',id,status:'in_progress',reason:''}),{action:'setEnquiryStatus',locale:'en',id,status:'in_progress',reason:''});
 assert.deepEqual(actions.parseOpsContentAction({action:'setEnquiryStatus',locale:'en',id,status:'resolved',reason:'Reviewed synthetic enquiry'}),{action:'setEnquiryStatus',locale:'en',id,status:'resolved',reason:'Reviewed synthetic enquiry'});
 assert.throws(()=>actions.parseOpsContentAction({action:'setEnquiryStatus',locale:'en',id,status:'resolved',reason:''}),/INVALID_OPS_CONTENT/);
 assert.throws(()=>actions.parseOpsContentAction({action:'setEnquiryStatus',locale:'en',id,status:'deleted',reason:'Invalid'}),/INVALID_OPS_CONTENT/);
});
