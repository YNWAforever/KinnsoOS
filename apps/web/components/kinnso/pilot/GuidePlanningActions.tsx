'use client'
import Link from 'next/link'
import {useEffect,useRef,useSyncExternalStore} from 'react'
import {useGuideFlow} from './useGuideFlow'
import {hasAnalyticsConsent,subscribeToAnalyticsConsent} from '@/lib/analytics/client'
import {trackWebPilotEvent} from '@/lib/analytics/pilot'
import type {Locale} from '@/lib/i18n/config'
export function GuidePlanningActions({guideId,href,label,unavailable,locale='en'}:{guideId:string;href:string|null;label:string;unavailable:string;locale?:Locale}){
 const flowId=useGuideFlow(guideId)
 const consented=useSyncExternalStore(subscribeToAnalyticsConsent,hasAnalyticsConsent,()=>false),tracked=useRef('')
 useEffect(()=>{
  const key=guideId+':'+flowId
  if(consented&&flowId&&tracked.current!==key&&trackWebPilotEvent({phase:'guide_viewed',guideId,flowId},locale))tracked.current=key
 },[consented,flowId,guideId,locale])
 return href?<Link className="k2-btn-primary mt-5 inline-flex" href={href+(flowId?'&flow='+flowId:'')} onClick={()=>{
  if(flowId)trackWebPilotEvent({phase:'started',guideId,flowId},locale)
 }}>{label}</Link>:<p className="mt-5 text-sm text-kinnso-muted">{unavailable}</p>
}
