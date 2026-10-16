import {uuid} from './events.ts';
import {rpc,type RpcClient} from './repository.ts';
export const pilotPhases=['guide_viewed','started','confirmed','adopted','edited','read','reopen_attempt','reopened','experience_referral','merchant_referral'] as const;
export type PilotPhase=typeof pilotPhases[number];
export type PilotEvent={phase:PilotPhase;requestId:string;sessionId:string;flowId?:string;guideId?:string;tripId?:string;experienceId?:string;revision?:number};
export type PilotMetrics={adoptionAttempts:number;adoptions:number;adoptionSuccessRate:number|null;firstCompletions:number;firstCompletionP50Ms:number|null;reopenAttempts:number;reopens:number;reopenSuccessRate:number|null;qualifiedGuideViews:number;experienceReferrals:number;merchantReferrals:number;merchantReferralRate:number|null};
export function parsePilotEvent(value:unknown):PilotEvent|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(key=>!['phase','requestId','sessionId','flowId','guideId','tripId','experienceId','revision'].includes(key))||!pilotPhases.includes(v.phase as PilotPhase))return null;
 for(const key of ['requestId','sessionId'])if(typeof v[key]!=='string'||!uuid.test(v[key]))return null;
 for(const key of ['flowId','guideId','tripId','experienceId'])if(v[key]!==undefined&&(typeof v[key]!=='string'||!uuid.test(v[key])))return null;
 if(v.revision!==undefined&&(!Number.isSafeInteger(v.revision)||(v.revision as number)<1))return null;
 const phase=v.phase as PilotPhase;
 if(['guide_viewed','started','experience_referral','merchant_referral'].includes(phase)&&(!v.guideId||!v.flowId))return null;
 if(['confirmed','adopted'].includes(phase)&&(!v.guideId||!v.tripId||!v.flowId))return null;
 if(['edited','read','reopen_attempt','reopened'].includes(phase)&&!v.tripId)return null;
 if(['edited','read','reopened','adopted'].includes(phase)&&v.revision===undefined)return null;
 if(['experience_referral','merchant_referral'].includes(phase)&&!v.experienceId)return null;
 return {...v} as PilotEvent;
}
export function parsePublicPilotEvent(value:unknown){
 const event=parsePilotEvent(value);
 return event&&['guide_viewed','started','experience_referral','merchant_referral'].includes(event.phase)&&event.tripId===undefined&&event.revision===undefined?event:null;
}
export async function recordPilotEvent(service:RpcClient,actorId:string|null,value:unknown,context:{mode:string;environment:string;synthetic:boolean;consent:string;context:string}){
 const event=parsePilotEvent(value);
 if(!event||context.mode!=='connected'||context.environment==='local'||context.synthetic||context.consent!=='accepted'||context.context==='admin')return{accepted:false};
 return rpc<{accepted:boolean;replayed?:boolean}>(service,'record_kinnso_pilot_event',{p_actor_id:actorId,p_event:event});
}
