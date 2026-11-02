'use server'
import {createSupabaseServerClient} from '@/lib/supabase/server'
import {capabilities} from '@kinnso/journeys/lib/contracts/capabilities'
import {executeBoundGuide,type BoundGuideIntent,type BoundResult} from './studio-adapter'
import {studioUuid} from '@kinnso/journeys/lib/studio/policy'
import type {GuideHandoff} from '@kinnso/journeys/lib/studio/contracts'
export async function saveOrPublishStudioGuide(intent:BoundGuideIntent):Promise<BoundResult>{
 const client=await createSupabaseServerClient(),auth=await client.auth.getUser()
 if(auth.error||!auth.data.user||auth.data.user.id!==intent.actorId)return{ok:false,code:'AUTH_REQUIRED',retryable:false}
 const creator=await client.from('creators').select('status').eq('id',auth.data.user.id).maybeSingle()
 if(creator.error||creator.data?.status!=='active')return{ok:false,code:'FORBIDDEN',retryable:false}
 const caps=capabilities(process.env)
 if(caps.conversation?.mode!=='connected'||caps.creatorBriefHandoff?.mode!=='connected'||caps.creator?.mode!=='connected')return{ok:false,code:'UNKNOWN',retryable:true}
 // One explicit allowlisted adapter while DB types await the approved migration.
 return executeBoundGuide(client as unknown as Parameters<typeof executeBoundGuide>[0],auth.data.user.id,intent)
}
export async function recoverBoundGuide(reference:{actorId:string;guideId:string;preparationId:string}):Promise<BoundResult>{
 if(!studioUuid(reference.actorId)||!studioUuid(reference.guideId)||!studioUuid(reference.preparationId))return{ok:false,code:'INVALID',retryable:false}
 const client=await createSupabaseServerClient(),auth=await client.auth.getUser()
 if(auth.error||auth.data.user?.id!==reference.actorId)return{ok:false,code:'AUTH_REQUIRED',retryable:false}
 const adapter=client as unknown as Parameters<typeof executeBoundGuide>[0]
 const result=await adapter.rpc('get_kinnso_studio_request',{p_request_id:reference.preparationId})
 if(result.error)return{ok:false,code:'UNKNOWN',retryable:true}
 const data=result.data as {status:string;receipt?:{data:GuideHandoff}}
 if(data.status==='restricted')return{ok:false,code:'FORBIDDEN',retryable:false}
 if(data.status!=='complete'||!data.receipt)return{ok:false,code:'UNKNOWN',retryable:true}
 const h=data.receipt.data
 if(h.guideId!==reference.guideId)return{ok:false,code:'FORBIDDEN',retryable:false}
 return saveOrPublishStudioGuide({actorId:reference.actorId,guideId:h.guideId,action:h.operation,requestId:h.domainRequestId,preparationId:reference.preparationId,expectedRevision:h.expectedRevision,payload:h.payload,confirmed:true})
}
