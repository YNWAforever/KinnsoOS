'use client'
import {useEffect,useRef,useSyncExternalStore} from 'react'
import {guideFlow} from '../../../../journeys/lib/telemetry/pilot-client'
import {hasAnalyticsConsent,subscribeToAnalyticsConsent} from '@/lib/analytics/client'
import {trackWebPilotEvent} from '@/lib/analytics/pilot'
import type {Locale} from '@/lib/i18n/config'
export function PilotExperienceArrival({guideId,experienceId,flowId,locale='en'}:{guideId?:string;experienceId:string;flowId?:string;locale?:Locale}){
 const consented=useSyncExternalStore(subscribeToAnalyticsConsent,hasAnalyticsConsent,()=>false),tracked=useRef('')
 useEffect(()=>{
  if(!guideId||!consented)return
  const flow=flowId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(flowId)?flowId:guideFlow(guideId)
  const key=guideId+':'+experienceId+':'+flow
  if(flow&&tracked.current!==key&&trackWebPilotEvent({phase:'experience_referral',guideId,experienceId,flowId:flow},locale))tracked.current=key
 },[guideId,experienceId,flowId,consented,locale])
 return null
}
