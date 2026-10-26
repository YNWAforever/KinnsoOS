'use client';
import {createContext,useCallback,useContext,useLayoutEffect,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {usePathname,useRouter} from 'next/navigation';import {Modal} from './ui';
import {safeAppDestination} from '../../lib/trips/draft-navigation';
type Guard={dirty:boolean;busy:boolean;saveLatest:(isLeaving?:()=>boolean)=>Promise<boolean>;scopeKey:string;kind?:'creator'};
type Registered={id:symbol;get:()=>Guard};type Pending={owner:symbol;scopeKey:string;run:()=>void};
type API={register:(id:symbol,get:()=>Guard)=>()=>void;changed:()=>void;isNavigationPending:(id:symbol)=>boolean;requestNavigation:(destination:string)=>void};
const NavigationContext=createContext<API|null>(null);
export function UnsavedDraftNavigationProvider({children}:{children:ReactNode}){
 const router=useRouter(),pathname=usePathname(),zh=pathname?.startsWith('/zh-HK');const t=(en:string,cn:string)=>zh?cn:en;
 const registered=useRef<Registered|null>(null),pending=useRef<Pending|null>(null),sequence=useRef(0);
 const [shown,setShown]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[,refresh]=useState(0);
 const cancel=useCallback(()=>{sequence.current++;pending.current=null;setShown(false);setSaving(false);setMessage('');},[]);
 const register=useCallback((id:symbol,get:()=>Guard)=>{registered.current={id,get};return()=>{if(registered.current?.id===id){registered.current=null;if(pending.current?.owner===id)cancel();}};},[cancel]);
 const changed=useCallback(()=>{if(!pending.current)return;const state=registered.current?.get();if(!state||state.scopeKey!==pending.current.scopeKey)cancel();else refresh(value=>value+1);},[cancel]);
 const request=useCallback((destination:string,run:()=>void)=>{
  if(!safeAppDestination(destination))return;
  const current=registered.current,state=current?.get();
  if(!current||!state||(!state.dirty&&!state.busy)){run();return;}
  sequence.current++;pending.current={owner:current.id,scopeKey:state.scopeKey,run};setMessage('');setSaving(false);setShown(true);
 },[]);
 const requestNavigation=useCallback((destination:string)=>{const safe=safeAppDestination(destination);if(safe)request(safe,()=>router.push(safe));},[request,router]);
 const isNavigationPending=useCallback((id:symbol)=>pending.current?.owner===id,[]);
 const api=useMemo(()=>({register,changed,isNavigationPending,requestNavigation}),[register,changed,isNavigationPending,requestNavigation]);
 useEffect(()=>{
  const click=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(!(anchor instanceof HTMLAnchorElement)||anchor.download||(anchor.target&&anchor.target!=='_self')||anchor.origin!==location.origin)return;
   const safe=safeAppDestination(anchor.pathname+anchor.search+anchor.hash),state=registered.current?.get();
   if(!safe||(!state?.dirty&&!state?.busy)||anchor.pathname+anchor.search===location.pathname+location.search)return;
   event.preventDefault();event.stopPropagation();requestNavigation(safe);
  };
  document.addEventListener('click',click,true);
  return()=>document.removeEventListener('click',click,true);
 },[request,requestNavigation]);
 // beforeunload does not run for same-document Back/Forward. We
 // need to restore the source entry before Next's popstate listener can unmount
 // the editor. Stamp only our own position; preserve all router/user state.
 useLayoutEffect(()=>{
  const key='__kinnsoDraftPosition';let session=crypto.randomUUID();
  let sourceState=history.state;
  let active=true,position=0,sourceURL=location.href,approved:number|null=null,restored:(()=>void)|null=null;
  const push=history.pushState,replace=history.replaceState;
  const stamp=(data:Record<string,unknown>|null,index:number)=>({...history.state,...data,[key]:{session,index}});
  const wrappedPush:History['pushState']=function(this:History,data,unused,url){if(!active){push.call(this,data,unused,url);return;}push.call(this,stamp(data,position+1),unused,url);position++;sourceURL=location.href;sourceState=history.state;approved=null;};
  const wrappedReplace:History['replaceState']=function(this:History,data,unused,url){replace.call(this,active?stamp(data,position):data,unused,url);if(active){sourceURL=location.href;sourceState=history.state;}};
  replace.call(history,stamp(history.state,position),'');sourceState=history.state;
  history.pushState=wrappedPush;history.replaceState=wrappedReplace;
  const sameRoute=()=>{const source=new URL(sourceURL);return source.pathname+source.search===location.pathname+location.search;};
  const trackHash=()=>{
   const entry=history.state?.[key];
   if(location.href===sourceURL||!sameRoute()||(entry?.session===session&&entry.index!==position))return false;
   // Native fragment links create entries without calling pushState.
   replace.call(history,stamp(history.state??sourceState,++position),'');sourceURL=location.href;sourceState=history.state;return true;
  };
  const pop=(event:PopStateEvent)=>{
   if(trackHash())return;
   const entry=event.state?.[key]??history.state?.[key];
   if(entry?.session!==session||!Number.isInteger(entry.index)){
    const state=registered.current?.get();
    if(!sameRoute()&&(state?.dirty||state?.busy)){
     event.stopImmediatePropagation();
     const destination=location.pathname+location.search+location.hash;
     // An unstamped entry has no trustworthy traversal offset. Re-establish
     // the editor entry before Next sees the pop, then navigate only on consent.
     // This discards the unknown forward chain; old positions are now foreign.
     session=crypto.randomUUID();position=0;approved=null;restored=null;
     push.call(history,stamp(sourceState,position),'',sourceURL);sourceState=history.state;
     requestNavigation(destination);return;
    }
    // Restart tracking after a clean traversal outside our known history chain.
    session=crypto.randomUUID();position=0;
    replace.call(history,stamp(history.state,position),'');sourceURL=location.href;sourceState=history.state;return;
   }
   const target=entry.index,delta=target-position;
   if(restored){
    event.stopImmediatePropagation();
    if(delta){history.go(-delta);return;}
    const resume=restored;restored=null;resume();return;
   }
   if(approved!==null){const allowed=approved===target;approved=null;if(allowed){position=target;sourceURL=location.href;sourceState=history.state;return;}}
   const state=registered.current?.get();
   if(!delta||sameRoute()||(!state?.dirty&&!state?.busy)){position=target;sourceURL=location.href;sourceState=history.state;return;}
   event.stopImmediatePropagation();
   const destination=location.pathname+location.search+location.hash;
   restored=()=>request(destination,()=>{approved=target;history.go(delta);});
   history.go(-delta);
  };
  window.addEventListener('popstate',pop,true);window.addEventListener('hashchange',trackHash);
  // Next can retain a bound wrapper during StrictMode cleanup. Retired
  // wrappers must become transparent so they cannot overwrite the new stamp.
  return()=>{active=false;restored=null;window.removeEventListener('popstate',pop,true);window.removeEventListener('hashchange',trackHash);if(history.pushState===wrappedPush)history.pushState=push;if(history.replaceState===wrappedReplace)history.replaceState=replace;};
 },[request,requestNavigation]);
 async function saveAndLeave(){
  const intent=pending.current,current=registered.current;if(!intent||!current||saving)return;
  if(current.get().busy){setMessage(t('Saving is still in progress. Keep this editor open.','仍在保存中，請保持編輯器開啟。'));return;}
  const ticket=++sequence.current;setSaving(true);setMessage('');let ok=false;try{ok=await current.get().saveLatest(()=>ticket===sequence.current&&pending.current===intent);}catch{}
  if(ticket!==sequence.current||pending.current!==intent)return;
  const latest=registered.current;
  if(!ok||latest?.id!==intent.owner||latest.get().scopeKey!==intent.scopeKey){setSaving(false);setMessage(t('Latest edits were not saved. Keep editing or retry.','最新修改尚未保存，請繼續編輯或重試。'));return;}
  cancel();intent.run();
 }
 const active=registered.current?.get(),creator=active?.kind==='creator';
 return <NavigationContext.Provider value={api}>{children}{shown&&<div className="k-app"><Modal title={creator?t('Unsaved guide draft','未保存的攻略草稿'):t('Unsaved device draft','未保存的裝置草稿')} onClose={cancel}><div className="k-modal-body">
  <p>{creator?t('Save your latest guide edits before leaving, or discard unsaved changes. The last confirmed server draft is kept.','離開前請保存最新攻略修改，或放棄未保存的修改。上次伺服器已確認的草稿會保留。'):t('Save before leaving, or discard only unsaved edits. The last saved device copy is kept.','離開前請保存，或只放棄尚未保存的修改。上次已保存的裝置副本會保留。')}</p>
  <div className="k-actions"><button className="k-btn primary" disabled={saving||active?.busy} onClick={()=>void saveAndLeave()}>{t('Save and leave','保存後離開')}</button><button className="k-btn" disabled={saving||active?.busy} onClick={()=>{const intent=pending.current;cancel();intent?.run();}}>{t('Discard unsaved edits','放棄未保存修改')}</button><button className="k-btn" onClick={cancel}>{t('Continue editing','繼續編輯')}</button></div>
  <p role="status">{saving?creator?t('Saving latest guide edits…','正在保存最新攻略修改…'):t('Saving latest device edits…','正在保存最新裝置修改…'):message}</p>
 </div></Modal></div>}</NavigationContext.Provider>;
}
export function useDraftNavigation(){const api=useContext(NavigationContext);if(!api)throw new Error('Draft navigation provider required');return api.requestNavigation;}
export function useUnsavedDraftGuard(state:Guard){
 const api=useContext(NavigationContext),latest=useRef(state),id=useRef(Symbol('device-draft'));latest.current=state;
 const register=api?.register,changed=api?.changed;
 useLayoutEffect(()=>register?.(id.current,()=>latest.current),[register]);
 useLayoutEffect(()=>changed?.(),[changed,state.dirty,state.busy,state.scopeKey]);
 // Protect native unload in layout, before any editor-specific passive effect.
 // Clean pages keep their browser back-forward cache eligibility.
 useLayoutEffect(()=>{
  if(!state.dirty&&!state.busy)return;
  const warn=(event:BeforeUnloadEvent)=>{const current=latest.current;if(current.dirty||current.busy){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[state.dirty,state.busy]);
 return useCallback(()=>api?.isNavigationPending(id.current)??false,[api]);
}
