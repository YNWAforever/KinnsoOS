import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness} from './helpers/workspace-harness.mjs';
import {readFile} from 'node:fs/promises';

test('P16 actual collector readiness requires the complete authorized mission card heading',async()=>{
 const title='Synthetic operations lab campaign',id='11111111-1111-4111-8111-111111111111';let finish;
 const detail={id,title:title+' 0',summary:'Owned summary',missionType:'coupon_affiliate',missionSource:'merchant',status:'published',visibility:'open',eligible:true,joinAvailable:false,evidenceAvailable:false,paidFeeAmount:null,requirements:[],deliverables:[],milestones:[],submissions:[],partnerLinks:[]};
 const h=await workspaceHarness('CreatorMissionsWorkspace',{creatorMissions:{get:()=>new Promise(resolve=>finish=resolve)}},{path:'studio/missions/'+id});
 const source=await readFile(new URL('../scripts/performance/run.mjs',import.meta.url),'utf8'),start=source.indexOf('async function ready('),end=source.indexOf('function traceWithoutArguments(',start);
 assert.ok(start>=0&&end>start);
 const document={body:{get textContent(){return h.text();}},querySelectorAll(selector){
  const nodes=selector==='h1'?h.elements().filter(node=>node.type==='h1'):selector==='article.k-card h2'?h.elements().filter(node=>node.type==='article'&&node.props.className.split(/\s+/).includes('k-card')).flatMap(card=>h.elements(card).filter(node=>node.type==='h2')):assert.fail('Unexpected detail readiness selector: '+selector);
  return nodes.map(node=>({textContent:h.text(node)}));
 }};
 let verified;
 const page={waitForFunction:async(predicate,options,...args)=>{verified=predicate(...args);}};
 const ready=new Function('document','foundation','workspacePages','workFixture',source.slice(start,end)+'return ready;')(document,false,['creatorDetail'],{title});
 await ready(page,'creatorDetail');assert.equal(verified,false,'a pending private read is not ready');
 finish({ok:true,data:detail});await new Promise(resolve=>setTimeout(resolve,0));h.render();
 await ready(page,'creatorDetail');assert.equal(verified,true,'the actual full-title card satisfies actual collector readiness');
 h.invalidate();await ready(page,'creatorDetail');assert.equal(verified,false,'denied private detail cannot satisfy readiness');
});

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
