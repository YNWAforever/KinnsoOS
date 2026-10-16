import {readConsent,uuid} from './events';
import type {PilotEvent} from './pilot';
const guideFlowKey=(guideId:string)=>'kinnso.pilot.flow.v1:'+guideId;
export function pilotSession():string|null{
 try{
  const key='kinnso.pilot.session.v1',stored=window.sessionStorage.getItem(key);
  if(stored&&uuid.test(stored))return stored;
  const id=crypto.randomUUID();window.sessionStorage.setItem(key,id);return id;
 }catch{return null}
}
export function guideFlow(guideId:string):string|null{
 try{
  const key=guideFlowKey(guideId),stored=window.sessionStorage.getItem(key);
  if(stored&&uuid.test(stored))return stored;
  const id=crypto.randomUUID();window.sessionStorage.setItem(key,id);window.dispatchEvent(new CustomEvent('kinnso:pilot-flow',{detail:{guideId}}));return id;
 }catch{return null}
}
export function readGuideFlow(guideId:string):string|null{
 try{const value=window.sessionStorage.getItem(guideFlowKey(guideId));return value&&uuid.test(value)?value:null}catch{return null}
}
/** Optional measurement can never block navigation or a durable trip command. */
export async function trackPilotEvent(value:Omit<PilotEvent,'requestId'|'sessionId'>,endpoint='/api/telemetry/pilot'){
 try{
  const consent=readConsent(window.localStorage),sessionId=pilotSession();
  if(consent.consent!=='accepted'||!sessionId)return;
  await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Kinnso-Analytics-Consent':'accepted','X-Kinnso-Consent-Version':'v1','X-Kinnso-Anonymous-Session':consent.anonymousSessionId},
   body:JSON.stringify({...value,sessionId,requestId:value.flowId??crypto.randomUUID()}),keepalive:true,cache:'no-store'});
 }catch{/* Missing consent, storage or measurement must not change product behavior. */}
}
