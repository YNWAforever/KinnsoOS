import test from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const m=await studioModule('merchant-tasks');
test('current company role gates match original owner-only profile/insights',()=>{
 assert.equal(typeof m.merchantTaskAllowed,'function');
 assert.equal(m.merchantTaskAllowed('M1','marketing'),false);assert.equal(m.merchantTaskAllowed('M5','finance'),false);
 for(const role of ['owner','marketing'])assert.equal(m.merchantTaskAllowed('M3',role),true);
 for(const role of ['clerk','finance'])assert.equal(m.merchantTaskAllowed('M4',role),false);
 assert.equal(m.merchantTaskAllowed('M2','clerk'),true);assert.equal(m.merchantTaskAllowed('M1',null),false);
});
test('company owner cannot gain another member private source or cross-company source',()=>{
 assert.equal(typeof m.merchantDocumentReadable,'function');
 const doc={companyId:'a',ownerId:'someone-else',visibility:'private',state:'active'};
 assert.equal(m.merchantDocumentReadable(doc,'me','a'),false);
 assert.equal(m.merchantDocumentReadable({...doc,visibility:'company'},'me','a'),true);
 assert.equal(m.merchantDocumentReadable({...doc,visibility:'company'},'me','b'),false);
 assert.equal(m.merchantDocumentReadable({...doc,ownerId:'me',state:'restricted'},'me','a'),false);
});
test('published campaign terms cannot be made editable by a studio template',()=>{
 assert.equal(typeof m.merchantPublicationChecks,'function');
 const missing=m.merchantPublicationChecks({status:'draft',canEdit:true,title:'Sample',summary:'',couponCode:'',couponUrl:'',affiliateRate:null,kinnsoRate:null,creatorRate:null,requirements:[],deliverables:[],milestones:[],applicationOpensAt:null,applicationClosesAt:null,scheduleTimeZone:'UTC'});
 assert.ok(missing.length>0);assert.ok(m.merchantPublicationChecks({status:'published',canEdit:false}).some(s=>s.includes('已發佈')));
});
test('missing metric denominators remain unknown and profile diff separates private contacts',()=>{
 assert.equal(typeof m.merchantInsightCards,'function');
 const cards=m.merchantInsightCards({counts:{invitationCohort:{issued:4,accepted:null},periodEvents:{attribution:null,redemptions:null},snapshot:{submitted:2,approved:1}},coverage:{}});
 assert.ok(cards.some(c=>c.label.includes('接受')&&c.value.includes('未知')));assert.ok(cards.some(c=>c.label.includes('歸因')&&c.value.includes('未知')));
 assert.equal(typeof m.merchantProfileDiff,'function');
 const diff=m.merchantProfileDiff({contactEmail:'old@example.invalid',tagline:'old'},{contactEmail:'new@example.invalid',tagline:'new'});
 assert.equal(diff.find(d=>d.key==='contactEmail').visibility,'private');assert.equal(diff.find(d=>d.key==='tagline').visibility,'public');
});
