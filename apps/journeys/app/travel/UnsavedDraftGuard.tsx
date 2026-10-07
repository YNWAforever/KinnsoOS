'use client';
import {createContext,useCallback,useContext,useLayoutEffect,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {usePathname,useRouter} from 'next/navigation';import {Modal} from './ui';
import {safeAppDestination} from '../../lib/trips/draft-navigation';
type Guard={dirty:boolean;busy:boolean;saveLatest:()=>Promise<boolean>;scopeKey:string};
type Registered={id:symbol;get:()=>Guard};type Pending={owner:symbol;scopeKey:string;run:()=>void};
type API={register:(id:symbol,get:()=>Guard)=>()=>void;changed:()=>void;requestNavigation:(destination:string)=>void};
const NavigationContext=createContext<API|null>(null);
// Public browser Navigation API; no Next router/history implementation state.
type TraverseEvent=Event&{navigationType:string;destination:{url:string;key:string};canIntercept:boolean};
type NavigationAPI={addEventListener:(name:string,fn:(event:TraverseEvent)=>void)=>void;removeEventListener:(name:string,fn:(event:TraverseEvent)=>void)=>void;traverseTo:(key:string)=>{finished:Promise<unknown>}};
export function UnsavedDraftNavigationProvider({children}:{children:ReactNode}){
 const router=useRouter(),pathname=usePathname(),zh=pathname?.startsWith('/zh-HK');const t=(en:string,cn:string)=>zh?cn:en;
 const registered=useRef<Registered|null>(null),pending=useRef<Pending|null>(null),sequence=useRef(0),bypass=useRef<string|null>(null);
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
 const api=useMemo(()=>({register,changed,requestNavigation}),[register,changed,requestNavigation]);
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
  const navigation=(window as Window&{navigation?:NavigationAPI}).navigation;
  const traverse=(event:TraverseEvent)=>{
   if(event.navigationType!=='traverse')return;
   if(bypass.current===event.destination.key){bypass.current=null;return;}
   const state=registered.current?.get();if(!state?.dirty&&!state?.busy)return;
   // Non-cancelable/older browsers retain the existing native unload warning.
   if(!event.cancelable)return;
   const url=new URL(event.destination.url);if(url.origin!==location.origin)return;
   const safe=safeAppDestination(url.pathname+url.search+url.hash);if(!safe)return;
   event.preventDefault();request(safe,()=>{bypass.current=event.destination.key;navigation!.traverseTo(event.destination.key).finished.catch(()=>{bypass.current=null;});});
  };
  navigation?.addEventListener('navigate',traverse);
  return()=>{document.removeEventListener('click',click,true);navigation?.removeEventListener('navigate',traverse);};
 },[request,requestNavigation]);
 async function saveAndLeave(){
  const intent=pending.current,current=registered.current;if(!intent||!current||saving)return;
  if(current.get().busy){setMessage(t('Saving is still in progress. Keep this editor open.','仍在保存中，請保持編輯器開啟。'));return;}
  const ticket=++sequence.current;setSaving(true);setMessage('');let ok=false;try{ok=await current.get().saveLatest();}catch{}
  if(ticket!==sequence.current||pending.current!==intent)return;
  const latest=registered.current;
  if(!ok||latest?.id!==intent.owner||latest.get().scopeKey!==intent.scopeKey){setSaving(false);setMessage(t('Latest edits were not saved. Keep editing or retry.','最新修改尚未保存，請繼續編輯或重試。'));return;}
  cancel();intent.run();
 }
 const active=registered.current?.get();
 return <NavigationContext.Provider value={api}>{children}{shown&&<div className="k-app"><Modal title={t('Unsaved device draft','未保存的裝置草稿')} onClose={cancel}><div className="k-modal-body">
  <p>{t('Save before leaving, or discard only unsaved edits. The last saved device copy is kept.','離開前請保存，或只放棄尚未保存的修改。上次已保存的裝置副本會保留。')}</p>
  <div className="k-actions"><button className="k-btn primary" disabled={saving||active?.busy} onClick={()=>void saveAndLeave()}>{t('Save and leave','保存後離開')}</button><button className="k-btn" disabled={saving||active?.busy} onClick={()=>{const intent=pending.current;cancel();intent?.run();}}>{t('Discard unsaved edits','放棄未保存修改')}</button><button className="k-btn" onClick={cancel}>{t('Continue editing','繼續編輯')}</button></div>
  <p role="status">{saving?t('Saving latest device edits…','正在保存最新裝置修改…'):message}</p>
 </div></Modal></div>}</NavigationContext.Provider>;
}
export function useDraftNavigation(){const api=useContext(NavigationContext);if(!api)throw new Error('Draft navigation provider required');return api.requestNavigation;}
export function useUnsavedDraftGuard(state:Guard){
 const api=useContext(NavigationContext),latest=useRef(state),id=useRef(Symbol('device-draft'));latest.current=state;
 const register=api?.register,changed=api?.changed;
 useLayoutEffect(()=>register?.(id.current,()=>latest.current),[register]);
 useLayoutEffect(()=>changed?.(),[changed,state.dirty,state.busy,state.scopeKey]);
}
