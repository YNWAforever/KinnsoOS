// Preview-only replacement for the persistent local-drafts storage boundary.
// Payloads live in the isolated server session, never IndexedDB/localStorage.
import type {TripSnapshot,TripCommand} from '../../../apps/journeys/lib/contracts/trips';
import type {PendingCreation,CreationInput,PendingAdoption,WorkspaceRecovery} from '../../../apps/journeys/lib/trips/local-drafts';
async function call<T>(operation:string,...args:unknown[]):Promise<T>{const r=await fetch('/__preview/cache',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,args}),cache:'no-store'});const body=await r.json();if(!r.ok||!body.ok)throw Error(body.code??'LOCAL_STORAGE_UNAVAILABLE');return body.data;}
export function invalidateAccountViews(ownerId:string|null){window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId}}));if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('kinnso-account-lifecycle');channel.postMessage({ownerId});channel.close();}}
export function subscribeAccountInvalidation(callback:(ownerId:string|null)=>void){const handler=(e:Event)=>callback((e as CustomEvent).detail.ownerId);window.addEventListener('kinnso:account-invalidated',handler);const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('kinnso-account-lifecycle'):null;if(channel)channel.onmessage=e=>{if(e.data?.ownerId===null||typeof e.data?.ownerId==='string')callback(e.data.ownerId);};return()=>{window.removeEventListener('kinnso:account-invalidated',handler);channel?.close();};}
export const synchronizeAccountCache=(ownerId:string)=>call<void>('synchronize',ownerId);
export const saveLocalSnapshot=(ownerId:string,snapshot:TripSnapshot)=>call<void>('saveSnapshot',ownerId,snapshot);
export const readLocalSnapshot=(ownerId:string,tripId:string)=>call<TripSnapshot|null>('readSnapshot',ownerId,tripId);
export const saveLocalDraft=(ownerId:string,tripId:string,baseRevision:number,command:TripCommand,requestId:string,allowReplace=false)=>call<void>('saveDraft',ownerId,tripId,baseRevision,command,requestId,allowReplace);
export const readLocalDraft=(ownerId:string,tripId:string)=>call<{ownerId:string;tripId:string;baseRevision:number;command:TripCommand;requestId:string}|null>('readDraft',ownerId,tripId);
export const clearLocalDraft=(ownerId:string,tripId:string,requestId:string)=>call<void>('clearDraft',ownerId,tripId,requestId);
export const clearAccountCaches=()=>call<void>('clear');
export const savePendingCreation=(ownerId:string,intent:PendingCreation,input:CreationInput)=>call<void>('saveCreation',ownerId,intent,input);
export const readPendingCreation=(ownerId:string,guideId:string|null)=>call<{intent:PendingCreation;input:CreationInput|null}|null>('readCreation',ownerId,guideId);
export const recordCreatedTrip=(ownerId:string,guideId:string|null,requestId:string,tripId:string)=>call<void>('recordCreation',ownerId,guideId,requestId,tripId);
export const clearPendingCreation=(ownerId:string,guideId:string|null,requestId:string)=>call<void>('clearCreation',ownerId,guideId,requestId);
export const clearRejectedCreation=(ownerId:string,guideId:string|null,requestId:string,input:CreationInput)=>call<void>('rejectCreation',ownerId,guideId,requestId,input);
export const restoreOriginalCreation=(ownerId:string,guideId:string|null,requestId:string,input:CreationInput)=>call<CreationInput>('restoreCreation',ownerId,guideId,requestId,input);
export const savePendingAdoption=(ownerId:string,intent:PendingAdoption)=>call<void>('saveAdoption',ownerId,intent);
export const readPendingAdoption=(ownerId:string,guideId:string)=>call<PendingAdoption|null>('readAdoption',ownerId,guideId);
export const readPendingAdoptions=(ownerId:string)=>call<PendingAdoption[]>('readAdoptions',ownerId);
export const clearPendingAdoption=(ownerId:string,guideId:string,requestId:string)=>call<void>('clearAdoption',ownerId,guideId,requestId);
export const saveLocalWorkspaceRecovery=(ownerId:string,scope:string,value:WorkspaceRecovery)=>call<void>('saveWorkspace',ownerId,scope,value);
export const readLocalWorkspaceRecovery=(ownerId:string,scope:string)=>call<WorkspaceRecovery|null>('readWorkspace',ownerId,scope);
export const clearLocalWorkspaceRecovery=(ownerId:string,scope:string,requestId?:string)=>call<void>('clearWorkspace',ownerId,scope,requestId);
export const releaseLocalWorkspaceRecovery=(ownerId:string,scope:string,requestId:string)=>call<void>('releaseWorkspace',ownerId,scope,requestId);
export const completeLocalWorkspaceRecovery=(ownerId:string,scope:string,requestId:string,draft:unknown)=>call<void>('completeWorkspace',ownerId,scope,requestId,draft);
