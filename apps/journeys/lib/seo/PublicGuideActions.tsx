'use client';

import {useEffect,useRef,useState} from 'react';
import {uuid} from '../api/validation';
import {subscribeAccountInvalidation} from '../trips/local-drafts';
import {bookmarks} from '../bookmarks/repository.ts';
import {publicLabels} from './public-labels.ts';

export function PublicGuideActions({guideId,locale}:{guideId:string;locale:string}){
 const labels=publicLabels(locale);if(!labels)throw new Error('unsupported_public_language');
 const [state,setState]=useState<'checking'|'anonymous'|'ready'|'readError'|'writeError'>('anonymous'),[saved,setSaved]=useState(false),[saving,setSaving]=useState(false),[attempt,setAttempt]=useState(0);
 const intent=useRef<{id:string;desired:boolean}|null>(null),busy=useRef(false),owner=useRef<string|null>(null),generation=useRef(0),readTicket=useRef(0);
 useEffect(()=>{
  if(typeof fetch!=='function'||typeof window==='undefined')return;
  const scope=++generation.current;
  const unsubscribe=subscribeAccountInvalidation(next=>{
   if(next===owner.current&&next!==null)return;
   generation.current++;owner.current=null;intent.current=null;busy.current=false;setSaved(false);setSaving(false);setState('anonymous');
  });
  fetch('/api/session',{cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('session');
   const body=await response.json();
   if(scope!==generation.current)return;
   const actorId=body.data?.id;
   if(!uuid(actorId)){setState('anonymous');return}
   owner.current=actorId;setState('checking');
   const ticket=++readTicket.current;
   const reading=bookmarks.list(actorId,undefined,guideId);
   // The authenticated return already declares the desired state. A delayed read
   // must not block this write or overwrite its acknowledged outcome.
   const query=new URLSearchParams(window.location.search);
   if(query.get('bookmark')==='1'){
    const id=query.get('requestId');
    void change(true,uuid(id)?id:undefined);
   }
   const result=await reading;
   if(scope!==generation.current||ticket!==readTicket.current)return;
   if(!result.ok){setState(result.code==='AUTH_REQUIRED'?'anonymous':'readError');return}
   setSaved(result.data.items.some(row=>row.guide_id===guideId));setState('ready');
  }).catch(()=>{if(scope===generation.current)setState('readError')});
  return()=>{generation.current++;owner.current=null;intent.current=null;busy.current=false;unsubscribe();};
 },[guideId,attempt]);
 async function change(desired:boolean,requestId?:string){
  const actorId=owner.current,scope=generation.current;
  if(busy.current||!actorId)return;
  intent.current??={id:requestId??crypto.randomUUID(),desired};
  const pending=intent.current;
  busy.current=true;readTicket.current++;setSaving(true);setState('ready');
  const result=await bookmarks.toggle(guideId,pending.desired,pending.id,actorId);
  if(scope!==generation.current||owner.current!==actorId)return;
  if(result.ok){
   setSaved(result.data.saved);intent.current=null;setState('ready');
   const url=new URL(window.location.href);
   if(url.searchParams.has('bookmark')||url.searchParams.has('requestId')){
    url.searchParams.delete('bookmark');url.searchParams.delete('requestId');
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
   }
  }
  else if(result.code==='AUTH_REQUIRED'){setState('anonymous');setSaved(false);intent.current=null;owner.current=null}
  else setState('writeError');
  busy.current=false;setSaving(false);
 }
 const next=encodeURIComponent(`/${locale}/g/${guideId}?bookmark=1`);
 const authLocale=['en','zh-HK'].includes(locale)?locale:'en';
 if(state==='anonymous')return <a className="k-btn" href={`/${authLocale}/sign-in?next=${next}`}>{labels.guides.signInToBookmark}</a>;
 if(state==='checking')return <p role="status">{labels.guides.checkingBookmark}</p>;
 if(state==='readError')return <div><p role="alert">{locale==='en'?'Bookmark status could not be loaded. Retry.':locale==='zh-HK'?'未能載入收藏狀態，請重試。':labels.guides.bookmarkError}</p><button className="k-btn" type="button" onClick={()=>{setState('checking');setAttempt(n=>n+1)}}>{locale==='en'?'Retry bookmark status':locale==='zh-HK'?'重試載入收藏狀態':labels.guides.retryBookmark}</button></div>;
 return <div><button className="k-btn" type="button" disabled={saving} aria-pressed={saved} onClick={()=>void change(!saved)}>{state==='writeError'?labels.guides.retryBookmark:saving?labels.guides.checkingBookmark:saved?labels.guides.removeBookmark:labels.guides.bookmarkGuide}</button>{state==='writeError'&&<p role="alert">{labels.guides.bookmarkError}</p>}</div>;
}
