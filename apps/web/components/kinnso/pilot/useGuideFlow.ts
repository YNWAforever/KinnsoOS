'use client'
import {useCallback,useSyncExternalStore} from 'react'
import {guideFlow,readGuideFlow} from '../../../../journeys/lib/telemetry/pilot-client'
const serverSnapshot=()=>null
export function useGuideFlow(guideId?:string){
 const subscribe=useCallback((listener:()=>void)=>{
  if(!guideId)return()=>{}
  const changed=(event:Event)=>{
   if(event.type==='storage'||(event as CustomEvent<{guideId:string}>).detail?.guideId===guideId)listener()
  }
  window.addEventListener('kinnso:pilot-flow',changed);window.addEventListener('storage',changed)
  guideFlow(guideId)
  return()=>{window.removeEventListener('kinnso:pilot-flow',changed);window.removeEventListener('storage',changed)}
 },[guideId])
 const snapshot=useCallback(()=>guideId?readGuideFlow(guideId):null,[guideId])
 return useSyncExternalStore(subscribe,snapshot,serverSnapshot)
}
