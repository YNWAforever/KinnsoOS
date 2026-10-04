import sharp from 'sharp'
import {randomUUID,createHash} from 'node:crypto'
import {beforeAll,afterAll,expect,it} from 'vitest'
import {actor,admin,anonymous,cleanup,trip} from './helpers/kinnso-local'
let a:Awaited<ReturnType<typeof actor>>,b:Awaited<ReturnType<typeof actor>>
beforeAll(async()=>{a=await actor();b=await actor()},60000);afterAll(cleanup,60000)
it('upload intent is owner/trip scoped, replay safe and rejects unsupported formats/size',async()=>{
 const t=await trip(a.client),args={p_trip_id:t.id,p_request_id:randomUUID(),p_mime:'image/png',p_size:68}
 const first=await a.client.rpc('prepare_trip_upload',args);expect(first.error).toBeNull()
 expect((await a.client.rpc('prepare_trip_upload',args)).data).toEqual(first.data)
 expect((await b.client.rpc('prepare_trip_upload',{...args,p_request_id:randomUUID()})).error?.message).toContain('trip_not_found')
 for(const meta of [{p_mime:'image/svg+xml',p_size:68},{p_mime:'image/heic',p_size:68},{p_mime:'image/jpeg',p_size:10485761}])expect((await a.client.rpc('prepare_trip_upload',{...args,...meta,p_request_id:randomUUID()})).error?.message).toContain('invalid_media')
 expect((await a.client.rpc('finalize_trip_upload',{p_actor_id:a.id,p_media_id:first.data.id,p_checksum:'0'.repeat(64)})).error?.code).toBe('42501')
})
it('private storage denies B and anonymous; privileged finalize validates actual bytes after fresh owner auth',async()=>{
 const t=await trip(a.client),bytes=await sharp({create:{width:1,height:1,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer()
 const intent=await a.client.rpc('prepare_trip_upload',{p_trip_id:t.id,p_request_id:randomUUID(),p_mime:'image/png',p_size:bytes.length});expect(intent.error).toBeNull()
 expect((await a.client.storage.from('kinnso-trip-private').upload(intent.data.path,bytes,{contentType:'image/png',upsert:false})).error).toBeNull()
 expect((await b.client.storage.from('kinnso-trip-private').download(intent.data.path)).error).not.toBeNull()
 expect((await anonymous.storage.from('kinnso-trip-private').download(intent.data.path)).error).not.toBeNull()
 const {finalizeMedia}=await import('../lib/media/service')
 const token=(await a.client.auth.getSession()).data.session!.access_token
 const checksum=createHash('sha256').update(bytes).digest('hex')
 const done=await finalizeMedia({token,id:intent.data.id,checksum},process.env);expect(done.state).toBe('ready')
 expect((await finalizeMedia({token,id:intent.data.id,checksum},process.env)).id).toBe(done.id)
 expect((await admin.from('kinnso_trip_media').select('state').eq('id',done.id).single()).data?.state).toBe('ready')
 await a.client.storage.from('kinnso-trip-private').remove([intent.data.path])
},30000)
