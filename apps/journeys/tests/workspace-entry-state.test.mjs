import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceHarness,tick} from './helpers/workspace-harness.mjs';

// Regression: putting the auth branch before the capability branch must fail.
// Execute the actual workspace; only its repository and framework boundaries vary.
for(const locale of ['en','zh-HK'])for(const name of ['CreatorWorkspace','MerchantWorkspace']){
 const path=name==='CreatorWorkspace'?'studio/guides':'merchant';
 const label=(en,zh)=>locale==='en'?en:zh;
 test(`W03 ${locale} ${name}: disabled service precedes sign-in and retains public exploration`,async()=>{
  let reads=0;
  const h=await workspaceHarness(name,{request:async()=>{reads++;throw Error('Disabled service read');}},{locale,path,actorId:null,enabled:false});
  assert.match(h.text(),locale==='en'?/not connected yet/:/尚未接通/);
  assert.equal(h.find('a',label('Sign in to continue','登入後繼續')),undefined);
  assert.equal(h.find('a',label('Explore guides','探索攻略'))?.props.href,`/${locale}/explore`);
  assert.ok(h.elements().some(n=>n.props?.role==='status'));
  assert.equal(reads,0);
 });
 test(`W03 ${locale} ${name}: connected signed-out entry retains the localized return task`,async()=>{
  let reads=0;
  const h=await workspaceHarness(name,{request:async()=>{reads++;throw Error('Signed out read');}},{locale,path,actorId:null,enabled:true});
  const link=h.find('a',label('Sign in to continue','登入後繼續'));
  assert.ok(link);assert.equal(new URL(link.props.href,'https://owned.test').searchParams.get('next'),`/${locale}/${path}`);
  assert.equal(reads,0);
 });
 for(const code of ['AUTH_REQUIRED','FORBIDDEN','UNAVAILABLE'])test(`W03 ${locale} ${name}: first ${code} offers only the appropriate read recovery`,async()=>{
  const calls=[];
  const h=await workspaceHarness(name,{request:async(...args)=>{calls.push(args);return{ok:false,code,retryable:code==='UNAVAILABLE'};}},{locale,path});
  assert.equal(calls.length,1);
  const retry=h.find('button',label('Retry loading','重試載入'));
  const signIn=h.find('a',label('Sign in to continue','登入後繼續'));
  assert.ok(h.elements().some(n=>n.props?.role==='alert'));
  if(code==='AUTH_REQUIRED'){
   assert.ok(signIn);assert.equal(new URL(signIn.props.href,'https://owned.test').searchParams.get('next'),`/${locale}/${path}`);
   assert.equal(retry,undefined);
  }else if(code==='FORBIDDEN'){
   assert.equal(retry,undefined);assert.equal(signIn,undefined);
   assert.match(h.text(),locale==='en'?/access|restricted/i:/權限|存取|限制/);
  }else{
   assert.ok(retry,'first read failure must be actionable even before company selection');
   assert.equal(signIn,undefined);
   retry.props.onClick();h.render();await tick();h.render();
   assert.equal(calls.length,2);assert.ok(calls.every(args=>args[1]===undefined),'recovery performs reads only');
   assert.doesNotMatch(h.text(),/No active company|Start with your first|未獲分配|第一份創作/);
  }
 });
}
