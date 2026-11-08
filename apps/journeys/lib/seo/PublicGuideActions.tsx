'use client';

import {useEffect,useRef,useState} from 'react';
import {uuid} from '../api/validation';
import {subscribeAccountInvalidation} from '../trips/local-drafts';
import {bookmarks} from '../bookmarks/repository.ts';
import {publicLabels} from './public-labels.ts';

export function PublicGuideActions({guideId,locale}:{guideId:string;locale:string}){
 const labels=publicLabels(locale);if(!labels)throw new Error('unsupported_public_language');
 const [state,setState]=useState<'checking'|'anonymous'|'ready'|'error'>('anonymous'),[saved,setSaved]=useState(false),[saving,setSaving]=useState(false);
 const requestId=useRef<string|null>(null),resumed=useRef(false),owner=useRef<string|null>(null);
 useEffect(()=>{
  if(typeof fetch!=='function'||typeof window==='undefined')return;
  let active=true;
  const unsubscribe=subscribeAccountInvalidation(next=>{
   if(next===owner.current&&next!==null)return;
   active=false;owner.current=null;requestId.current=null;setSaved(false);setSaving(false);setState('anonymous');
  });
  fetch('/api/session',{cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('session');
   const body=await response.json();
   if(!active)return;
   const actorId=body.data?.id;
   if(!uuid(actorId)){setState('anonymous');return}
   owner.current=actorId;
   const result=await bookmarks.list(actorId,undefined,guideId);
   if(!active)return;
   if(!result.ok){setState(result.code==='AUTH_REQUIRED'?'anonymous':'error');return}
   setSaved(result.data.items.some(row=>row.guide_id===guideId));setState('ready');
   const query=new URLSearchParams(window.location.search);
   if(!resumed.current&&query.get('bookmark')==='1'){
    const id=query.get('requestId');
    resumed.current=true;requestId.current=uuid(id)?id:crypto.randomUUID();
    void change(true);
   }
  }).catch(()=>{if(active)setState('error')});
  return()=>{active=false;owner.current=null;requestId.current=null;resumed.current=false;unsubscribe();};
 },[guideId]);
 async function change(desired:boolean){
  const actorId=owner.current;
  if(saving||!actorId)return;
  requestId.current??=crypto.randomUUID();
  setSaving(true);setState('ready');
  const result=await bookmarks.toggle(guideId,desired,requestId.current,actorId);
  if(owner.current!==actorId)return;
  if(result.ok){
   setSaved(result.data.saved);requestId.current=null;setState('ready');
   const url=new URL(window.location.href);
   if(url.searchParams.has('bookmark')||url.searchParams.has('requestId')){
    url.searchParams.delete('bookmark');url.searchParams.delete('requestId');
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
   }
  }
  else if(result.code==='AUTH_REQUIRED'){setState('anonymous');requestId.current=null}
  else setState('error');
  setSaving(false);
 }
 const next=encodeURIComponent(`/${locale}/g/${guideId}?bookmark=1`);
 const authLocale=['en','zh-HK'].includes(locale)?locale:'en';
 if(state==='anonymous')return <a className="k-btn" href={`/${authLocale}/sign-in?next=${next}`}>{labels.guides.signInToBookmark}</a>;
 if(state==='checking')return <p role="status">{labels.guides.checkingBookmark}</p>;
 return <div><button className="k-btn" type="button" disabled={saving} aria-pressed={saved} onClick={()=>void change(!saved)}>{state==='error'?labels.guides.retryBookmark:saving?labels.guides.checkingBookmark:saved?labels.guides.removeBookmark:labels.guides.bookmarkGuide}</button>{state==='error'&&<p role="alert">{labels.guides.bookmarkError}</p>}</div>;
}
