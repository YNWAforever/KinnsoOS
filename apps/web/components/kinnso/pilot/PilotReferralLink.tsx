'use client'
import Link from 'next/link'
import type {ReactNode} from 'react'
import {useGuideFlow} from './useGuideFlow'
import {trackWebPilotEvent} from '@/lib/analytics/pilot'
import type {Locale} from '@/lib/i18n/config'
export function PilotReferralLink({href,guideId,experienceId,phase='experience_referral',className,children,locale='en'}:{href:string;guideId?:string;experienceId:string;phase?:'experience_referral'|'merchant_referral';className?:string;children:ReactNode;locale?:Locale}){
 const flowId=useGuideFlow(guideId)
 const target=flowId?href+(href.includes('?')?'&':'?')+'flow='+flowId:href
 return <Link href={target} className={className} onClick={()=>{
  if(phase==='merchant_referral'&&guideId&&flowId)trackWebPilotEvent({phase,guideId,experienceId,flowId},locale)
 }}>{children}</Link>
}
