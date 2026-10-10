'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './ui';
import {CollaborationTasks} from './CollaborationTasks';
import {WorkspaceServiceState} from './WorkspaceServiceState';
import {creatorTasks} from '../../lib/collaboration/tasks';
import {creatorMissions,type CreatorMission} from '../../lib/creators/collaboration';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';

export function CreatorCollaborationTasks({actorId,enabled,onDenied}:{actorId:string|null;enabled:boolean;onDenied?:(code:string)=>void}){
 const{locale,t,href}=useApp();
 const[items,setItems]=useState<CreatorMission[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[valid,setValid]=useState(true);
 const generation=useRef(0),scope=useRef(actorId),reference=useRef<string|undefined>(undefined),denied=useRef(onDenied);denied.current=onDenied;
 async function load(){
  if(!actorId||!enabled||scope.current!==actorId)return;
  const own=++generation.current;setBusy(true);setError('');setItems(null);
  const result=await creatorMissions.list('mine');if(own!==generation.current)return;setBusy(false);
  if(!result.ok){reference.current=result.requestId;setError(result.code);if(['AUTH_REQUIRED','FORBIDDEN'].includes(result.code))denied.current?.(result.code);return;}
  setItems(result.data.items);
 }
 useEffect(()=>{
  generation.current++;scope.current=actorId;setItems(null);setError('');setValid(true);if(actorId&&enabled)void load();
  const off=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;scope.current=null;setItems(null);setBusy(false);setValid(false);}});
  return()=>{generation.current++;scope.current=null;off();};
 },[actorId,enabled]);
 if(!actorId||!valid||!enabled)return <WorkspaceServiceState locale={locale} code={!enabled?'UNAVAILABLE':'AUTH_REQUIRED'} retryState="blocked" returnPath={href('studio')}/>;
 return <div id="creator-next-actions">
  {busy&&<p role="status">{t('Loading your next actions…','正在載入下一步…')}</p>}
  {error&&<WorkspaceServiceState locale={locale} code={error} requestId={reference.current} retryState="read" onRetry={()=>void load()} returnPath={href('studio')}/>}
  {items&&<CollaborationTasks locale={locale} actions={creatorTasks(items,locale)}/>}
  <a className="k-btn" href={href('studio/outcomes')}>{t('Open all collaborations','開啟所有合作')}</a>
 </div>;
}
