import {test,expect,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {resolve} from 'node:path';

// Real invitation, profile and campaign components share their actual lock signals.
// All reads are controlled promises, with no hosted accounts, writes or sleeps.
const company='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let script='';
test.beforeAll(async()=>{
 const ports:Record<string,string>={
  ui:`export const useApp=()=>({locale:window.fixtureLocale,t:(en,zh)=>window.fixtureLocale==='en'?en:zh,href:p=>'/'+window.fixtureLocale+'/'+p});`,
  router:`export const useSearchParams=()=>new URLSearchParams(window.location.search);`,
  session:`export const subscribeAccountInvalidation=fn=>{const h=()=>fn(null);window.addEventListener('invalidate',h);return()=>window.removeEventListener('invalidate',h)};export const synchronizeAccountCache=async()=>{};export const readLocalWorkspaceRecovery=async()=>null;export const saveLocalWorkspaceRecovery=async()=>{};export const clearLocalWorkspaceRecovery=async()=>{};export const releaseLocalWorkspaceRecovery=async()=>{};export const completeLocalWorkspaceRecovery=async()=>{};`,
  repository:`export const request=(...args)=>window.fixtureRead(...args);`,
 };
 const out=await build({stdin:{contents:`
 import React from 'react';import{createRoot}from'react-dom/client';
 import{MerchantInvitations}from'./app/travel/MerchantInvitations';import{MerchantProfile}from'./app/travel/MerchantProfile';import{MerchantCampaigns}from'./app/travel/MerchantCampaigns';
 const waiters={};window.fixtureReads={};window.fixtureWrites=0;
 window.fixtureRead=(url,method)=>{if(method&&method!=='GET'){window.fixtureWrites++;throw Error('Unexpected command')};const kind=url.split('?')[0].split('/').pop();window.fixtureReads[kind]=(window.fixtureReads[kind]??0)+1;return new Promise(resolve=>(waiters[kind]??=[]).push(resolve));};
 window.fixtureResolve=(kind,result)=>{const done=waiters[kind]?.shift();if(!done)throw Error('No pending read '+kind);done(result)};
 const noop=()=>{},changed=async()=>{};
 function Fixture(){const[scope,setScope]=React.useState({actorId:'actor-A',merchantId:'${company}'}),[profileLock,setProfileLock]=React.useState(false),[campaignLock,setCampaignLock]=React.useState(false),[invitationLock,setInvitationLock]=React.useState(false),[refresh,setRefresh]=React.useState(0),[showProfile,setShowProfile]=React.useState(!window.fixtureDelayProfile);
 window.fixtureShowProfile=()=>setShowProfile(true);window.fixtureScope=setScope;window.fixtureRefresh=()=>setRefresh(x=>x+1);
 return <><MerchantInvitations key={scope.merchantId} {...scope} branches={[{id:scope.merchantId,name:'Owned branch'}]} locked={profileLock||campaignLock} onDenied={noop} onLockChange={setInvitationLock}/>
 {showProfile&&<MerchantProfile key={'profile:'+scope.merchantId} {...scope} onLockChange={setProfileLock}/>}
 <MerchantCampaigns key={'campaign:'+scope.merchantId} {...scope} refreshKey={refresh} locked={profileLock||invitationLock} onDenied={noop} onLockChange={setCampaignLock} onChanged={changed}/></>;
 }
 createRoot(document.getElementById('fixture')).render(<Fixture/>);
 `,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'retention-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{const key=args.path==='./ui'?'ui':args.path==='next/navigation'?'router':args.path.endsWith('/trips/local-drafts')?'session':args.path.endsWith('/trips/repository')?'repository':null;return key?{path:key,namespace:'port'}:null;});
  b.onLoad({filter:/.*/,namespace:'port'},args=>({contents:ports[args.path],loader:'js'}));
 }}]});script=out.outputFiles[0].text;
});
const profile={companyName:'Owned company',contactName:'Owned contact',contactEmail:'owned@example.test',websiteUrl:'',tagline:'',city:'',logoUrl:'',updatedAt:'2026-10-12T00:00:00Z'};
const campaigns=(id=company)=>({merchantId:id,role:'owner',items:[],nextCursor:null,detail:null,branches:[],summary:{draft:0,published:0,closed:0,applications:0,activeCreators:0,submitted:0,approved:0}});
const invitations=(id=company)=>({merchantId:id,invitations:[],nextCursor:null});
async function settle(page:Page,kind:string,data:unknown){await page.evaluate(({kind,data})=>(window as any).fixtureResolve(kind,{ok:true,data}),{kind,data});}
async function mount(page:Page,locale:string,delayedProfile=false){
 await page.route('http://127.0.0.1:3495/__retention**',route=>route.fulfill({contentType:'text/html',body:'<main id="fixture"></main>'}));
 await page.goto('http://127.0.0.1:3495/__retention');await page.evaluate(({locale,delayedProfile})=>{(window as any).fixtureLocale=locale;(window as any).fixtureDelayProfile=delayedProfile;},{locale,delayedProfile});await page.addScriptTag({content:script});
 if(!delayedProfile)await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.profile??0)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.campaigns??0)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.invitations??0)).toBe(1);
 await settle(page,'invitations',invitations());if(!delayedProfile)await settle(page,'profile',profile);
}
for(const locale of ['en','zh-HK']){
 const label=(en:string,zh:string)=>locale==='en'?en:zh;
 test(`W04 ${locale}: late campaign and profile reads preserve invitation fields without refilling`,async({page})=>{
  await mount(page,locale);
  const email=page.getByLabel(label('Recipient email','收件人電郵'),{exact:true}),name=page.getByLabel(label('Private invitation label','私人邀請名稱'),{exact:true}),reason=page.getByLabel(label('Invitation reason','邀請原因'),{exact:true});
  await expect(email).toBeEnabled();await email.fill('owned@example.test');await expect(email).toHaveValue('owned@example.test');
  await name.fill('Owned colleague');await expect(name).toHaveValue('Owned colleague');
  // The initial campaign read completes after both fields were authored.
  await settle(page,'campaigns',campaigns());await expect(page.getByLabel(label('Brief title','簡報標題'),{exact:true})).toBeEnabled();
  await expect(name).toHaveValue('Owned colleague');await expect(email).toHaveValue('owned@example.test');
  await page.getByLabel(label('Company introduction','公司簡介'),{exact:true}).fill('Owned profile draft');
  await page.getByRole('button',{name:label('Discard edits and reload','放棄修改並重新載入'),exact:true}).click();
  await expect(name).toBeEnabled();await expect(name).toHaveValue('Owned colleague');
  await settle(page,'profile',profile);await expect(name).toBeEnabled();await expect(name).toHaveValue('Owned colleague');
  await reason.fill('Owned review');await expect(reason).toHaveValue('Owned review');
  await page.getByRole('group',{name:label('Invitation branches','邀請分店'),exact:true}).getByLabel('Owned branch',{exact:true}).check();
  await page.getByRole('button',{name:label('Refresh invitations','重新載入邀請'),exact:true}).click();await expect(name).toBeDisabled();await expect(name).toHaveValue('Owned colleague');
  await settle(page,'invitations',invitations());await expect(name).toBeEnabled();
  await expect(reason).toHaveValue('Owned review');await expect(email).toHaveValue('owned@example.test');await expect(name).toHaveValue('Owned colleague');
  await expect(page.getByRole('button',{name:label('Create private invitation','建立私人邀請'),exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).fixtureWrites)).toBe(0);
 });
 test(`W05 ${locale}: a late profile mount cannot blur an enabled invitation before its first input`,async({page})=>{
  await mount(page,locale,true);
  const email=page.getByLabel(label('Recipient email','收件人電郵'),{exact:true});await expect(email).toBeEnabled();await email.focus();
  // Reproduce the recorded focus -> late profile GET -> disabled/blur window.
  await page.evaluate(()=>(window as any).fixtureShowProfile());await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.profile??0)).toBe(1);
  await expect(email).toBeEnabled();await expect(email).toBeFocused();await page.keyboard.insertText('owned@example.test');await expect(email).toHaveValue('owned@example.test');
  await settle(page,'profile',profile);await settle(page,'campaigns',campaigns());
  await expect(email).toBeFocused();await expect(email).toHaveValue('owned@example.test');expect(await page.evaluate(()=>(window as any).fixtureWrites)).toBe(0);
 });
 test(`W04 ${locale}: a changed company clears fields and ignores its previous pending directory`,async({page})=>{
  await mount(page,locale);await settle(page,'campaigns',campaigns());
  const name=page.getByLabel(label('Private invitation label','私人邀請名稱'),{exact:true});await name.fill('Old scoped draft');
  await page.getByRole('button',{name:label('Refresh invitations','重新載入邀請'),exact:true}).click();
  await page.evaluate(merchantId=>(window as any).fixtureScope({actorId:'actor-A',merchantId}),other);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixtureReads.invitations)).toBe(3);
  await settle(page,'invitations',{...invitations(),invitations:[{id:company,label:'Old private directory',role:'clerk',branchIds:[],status:'pending',expiresAt:'2099'}]});
  await settle(page,'invitations',invitations(other));await settle(page,'profile',profile);await settle(page,'campaigns',campaigns(other));
  await expect(name).toBeEnabled();await expect(name).toHaveValue('');await expect(page.getByText('Old private directory',{exact:false})).toHaveCount(0);
  await name.fill('New scoped draft');await page.evaluate(()=>window.dispatchEvent(new Event('invalidate')));await expect(name).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixtureWrites)).toBe(0);
 });
}
