import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const compiled=await transform(await readFile(new URL('../lib/notifications/repository.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'});
const module={exports:{}};
runInContext(compiled.code,createContext({module,exports:module.exports,require:name=>{
 if(name.endsWith('/trips/repository'))return{request(){throw Error('No request in link test');}};
 throw Error(name);
}}));
const {entityLink}=module.exports;
import {workspaceHarness} from './helpers/workspace-harness.mjs';
const mission='11111111-1111-4111-8111-111111111111',first='22222222-2222-4222-8222-222222222222',second='33333333-3333-4333-8333-333333333333';
const event=(id,title,dueAt)=>({id,type:'collaboration.due_soon',entityType:'mission',entityId:mission,readAt:null,createdAt:'2026-10-12T00:00:00Z',payload:{missionTitle:'Owned collaboration',milestoneId:id,milestoneTitle:title,dueAt,deadlineVersion:dueAt}});
test('W08: reminder links identify each milestone; legacy and malformed context stay on the authorized mission',()=>{
 const item=event(first,'Original guide','2026-10-13T06:00:00Z');
 for(const locale of ['en','zh-HK']){
  assert.equal(entityLink(item,locale),`/${locale}/studio/missions/${mission}#milestone-${first}`);
  for(const patch of [{milestoneId:'../../private'},{milestoneTitle:''},{dueAt:'invalid'},{deadlineVersion:'2026-10-14T06:00:00Z'}])
   assert.equal(entityLink({...item,payload:{...item.payload,...patch}},locale),`/${locale}/studio/missions/${mission}`);
  assert.equal(entityLink({...item,payload:{missionTitle:'Legacy'}},locale),`/${locale}/studio/missions/${mission}`);
  assert.equal(entityLink({...item,type:'submission.approved'},locale),`/${locale}/studio/missions/${mission}`);
 }
});
for(const locale of ['en','zh-HK'])test(`W08 ${locale}: same-campaign deadlines show distinct work, event deadline and timezone`,async()=>{
 const items=[event(first,'Publish original guide','2026-10-13T06:00:00Z'),event(second,'Share original video','2026-10-13T08:00:00Z')];
 const h=await workspaceHarness('InboxWorkspace',{request:async()=>({ok:true,data:{items,nextCursor:null,unreadCount:2,externalDelivery:'unconfigured'}})},{locale,path:'inbox'});
 assert.match(h.text(),/Publish original guide/);assert.match(h.text(),/Share original video/);assert.match(h.text(),/UTC/);
 const dates=h.elements().filter(n=>n.type==='time').map(n=>n.props.dateTime);
 for(const item of items)assert.ok(dates.includes(item.payload.dueAt),'deadline must not be replaced by the event creation time');
 const links=h.elements().filter(n=>n.type==='a').map(n=>n.props.href);
 for(const item of items)assert.ok(links.includes(`/${locale}/studio/missions/${mission}#milestone-${item.payload.milestoneId}`));
});
