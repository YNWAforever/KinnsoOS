'use client';
import{useEffect,useRef,useState}from'react';
import{synchronizeAccountCache,readLocalWorkspaceRecovery,saveLocalWorkspaceRecovery,clearLocalWorkspaceRecovery,releaseLocalWorkspaceRecovery,completeLocalWorkspaceRecovery,type WorkspaceRecovery}from'../../lib/trips/local-drafts';
/** Actor-bound device drafts are restored only after a fresh authorized backend read. */
export function useWorkspaceRecovery({actorId,scope,authorized,draft,pending,dirty,restore}:{actorId:string|null;scope:string;authorized:boolean;draft:unknown;pending:WorkspaceRecovery['pending'];dirty:boolean;restore:(value:WorkspaceRecovery)=>void}){
 const[ready,setReady]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');const epoch=useRef(0),restored=useRef(''),queue=useRef(Promise.resolve()),current=useRef({draft,pending,dirty,restore});current.current={draft,pending,dirty,restore};
 useEffect(()=>{const own=++epoch.current;setReady(false);setSaved(false);setError('');if(!actorId||!authorized){restored.current='';return;}const key=actorId+':'+scope;
  if(restored.current===key){setReady(true);return;}
  void(async()=>{try{await synchronizeAccountCache(actorId);if(own!==epoch.current)return;const value=await readLocalWorkspaceRecovery(actorId,scope);if(own!==epoch.current)return;if(value)current.current.restore(value);restored.current=key;setReady(true);}catch{if(own===epoch.current)setError('LOCAL_STORAGE_UNAVAILABLE');}})();return()=>{epoch.current++;};
 },[actorId,scope,authorized]);
 useEffect(()=>{const prevent=(event:BeforeUnloadEvent)=>{if(authorized&&(dirty||pending)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[authorized,dirty,pending]);
 const signature=JSON.stringify(draft);
 useEffect(()=>{if(!ready||!actorId||!authorized||current.current.pending)return;const own=epoch.current,value=current.current;setSaved(false);queue.current=queue.current.catch(()=>{}).then(async()=>{if(own!==epoch.current)return;if(value.dirty)await saveLocalWorkspaceRecovery(actorId,scope,{version:1,draft:value.draft,pending:null});else await clearLocalWorkspaceRecovery(actorId,scope);if(own===epoch.current){setSaved(value.dirty);setError('');}}).catch(()=>{if(own===epoch.current)setError('LOCAL_STORAGE_UNAVAILABLE');});},[signature,ready,actorId,scope,authorized]);
 async function retain(value:WorkspaceRecovery['pending']){if(!actorId||!authorized||!ready)throw Error('LOCAL_STORAGE_UNAVAILABLE');const own=epoch.current;await queue.current;await saveLocalWorkspaceRecovery(actorId,scope,{version:1,draft:current.current.draft,pending:value});if(own!==epoch.current)throw Error('CACHE_ACCOUNT_CHANGED');setSaved(true);setError('');}
 async function clear(requestId?:string){if(actorId)await clearLocalWorkspaceRecovery(actorId,scope,requestId);setSaved(false);}
 async function release(requestId:string){if(actorId)await releaseLocalWorkspaceRecovery(actorId,scope,requestId);setSaved(true);}
 async function complete(requestId:string,completedDraft:unknown){if(!actorId||!authorized||!ready)throw Error('LOCAL_STORAGE_UNAVAILABLE');const own=epoch.current;await queue.current;if(own!==epoch.current)throw Error('CACHE_ACCOUNT_CHANGED');await completeLocalWorkspaceRecovery(actorId,scope,requestId,completedDraft);if(own!==epoch.current)throw Error('CACHE_ACCOUNT_CHANGED');setSaved(true);setError('');}
 return{ready,saved,error,retain,clear,release,complete};
}
