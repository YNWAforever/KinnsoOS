import {createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import sharp from 'sharp'
type Env=Record<string,string|undefined>
function clients(env:Env,token?:string) {
 const origin=env.SUPABASE_URL??env.NEXT_PUBLIC_SUPABASE_URL
 if(!origin||origin!==env.KINNSO_APPROVED_SUPABASE_ORIGIN)throw new Error('UNAVAILABLE')
 const parsed=new URL(origin);if(parsed.protocol!=='https:'&&!(env.KINNSO_TEST_TARGET==='local'&&(parsed.origin==='http://127.0.0.1:58421'||env.CI==='true'&&env.KINNSO_TEST_PROJECT==='kinnso-v3'&&parsed.origin==='http://127.0.0.1:54421')))throw new Error('UNAVAILABLE')
 return{user:createClient(origin,env.SUPABASE_ANON_KEY??env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:token?{Authorization:'Bearer '+token}:{}}}),service:createClient(origin,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})}
}
export function validateImageBytes(bytes:Uint8Array,mime:string) {
 const b=Buffer.from(bytes);if(b.length>10485760)throw new Error('INVALID_MEDIA')
 if(mime==='image/png'){
  if(b.length<24||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('INVALID_MEDIA')
  for(let offset=8;offset+12<=b.length;){const size=b.readUInt32BE(offset),type=b.subarray(offset+4,offset+8).toString();if(offset+12+size>b.length||['eXIf','tEXt','iTXt','zTXt'].includes(type))throw new Error('INVALID_MEDIA');offset+=12+size}
 }else if(mime==='image/jpeg'){
  if(b.length<4||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)throw new Error('INVALID_MEDIA')
  for(let offset=2;offset+4<=b.length;){if(b[offset]!==255)throw new Error('INVALID_MEDIA');const marker=b[offset+1];if(marker===218||marker===217)break;const size=b.readUInt16BE(offset+2);if(size<2||offset+2+size>b.length||marker===225)throw new Error('INVALID_MEDIA');offset+=2+size}
 }else if(mime==='image/webp'){
  if(b.length<12||b.subarray(0,4).toString()!=='RIFF'||b.subarray(8,12).toString()!=='WEBP')throw new Error('INVALID_MEDIA')
  for(let offset=12;offset+8<=b.length;){const type=b.subarray(offset,offset+4).toString(),size=b.readUInt32LE(offset+4);if(offset+8+size>b.length||['EXIF','XMP '].includes(type))throw new Error('INVALID_MEDIA');offset+=8+size+(size%2)}
 }else throw new Error('INVALID_MEDIA')
 return createHash('sha256').update(b).digest('hex')
}
export async function finalizeMedia(input:{token:string;id:string;checksum:string},env:Env) {
 const {user,service}=clients(env,input.token),actor=await user.auth.getUser(input.token)
 if(actor.error||!actor.data.user)throw new Error('AUTH_REQUIRED')
 const fresh=await user.rpc('kinnso_actor');if(fresh.error||fresh.data?.id!==actor.data.user.id)throw new Error('AUTH_REQUIRED')
 const metadata=await user.from('kinnso_trip_media').select('id,owner_id,trip_id,object_path,mime,byte_size').eq('id',input.id).single()
 if(metadata.error||metadata.data.owner_id!==actor.data.user.id)throw new Error('NOT_FOUND')
 const snapshot=await user.rpc('get_trip_snapshot',{p_trip_id:metadata.data.trip_id});if(snapshot.error)throw new Error('NOT_FOUND')
 const object=await user.storage.from('kinnso-trip-private').download(metadata.data.object_path);if(object.error)throw new Error('INVALID_MEDIA')
 const bytes=new Uint8Array(await object.data.arrayBuffer());if(bytes.length!==metadata.data.byte_size)throw new Error('INVALID_MEDIA')
 const checksum=validateImageBytes(bytes,metadata.data.mime);if(checksum!==input.checksum)throw new Error('INVALID_MEDIA')
 const image=sharp(bytes,{limitInputPixels:40000000,failOn:'warning'}),info=await image.metadata()
 if(!info.width||!info.height||!['jpeg','png','webp'].includes(info.format??'')||info.exif||info.xmp)throw new Error('INVALID_MEDIA')
 // Decode every pixel; a forged header or truncated stream cannot finalize.
 await image.raw().toBuffer()
 const result=await service.rpc('finalize_trip_upload',{p_actor_id:actor.data.user.id,p_media_id:metadata.data.id,p_checksum:checksum});if(result.error)throw new Error('INVALID_MEDIA')
 return result.data as {id:string;state:'ready';ownerId:string;visibility:'private'}
}
export async function cleanupMedia(env:Env) {
 const {service}=clients(env),pending=await service.rpc('kinnso_media_cleanup_candidates');if(pending.error)throw new Error('UNAVAILABLE')
 const paths=pending.data as string[];if(paths.length){const removed=await service.storage.from('kinnso-trip-private').remove(paths);if(removed.error)throw new Error('UNAVAILABLE');const ack=await service.rpc('kinnso_media_cleanup_ack',{p_paths:paths});if(ack.error)throw new Error('UNAVAILABLE')}
 return{removed:paths.length}
}
export async function sharedMedia(token:string,id:string,env:Env) {
 const {service}=clients(env),authorization=await service.rpc('get_shared_trip_media',{p_token:token,p_media_id:id})
 if(authorization.error||!authorization.data)throw new Error('NOT_FOUND')
 const data=authorization.data as {path:string;mime:string},object=await service.storage.from('kinnso-trip-private').download(data.path)
 if(object.error)throw new Error('NOT_FOUND')
 return{blob:object.data,mime:data.mime}
}
