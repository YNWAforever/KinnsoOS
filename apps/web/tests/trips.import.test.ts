import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,expect,it} from 'vitest'
import {actor,cleanup} from './helpers/kinnso-local'
let a:Awaited<ReturnType<typeof actor>>,b:Awaited<ReturnType<typeof actor>>
beforeAll(async()=>{a=await actor();b=await actor()},60000);afterAll(cleanup,60000)
const payload={title:'Synthetic local export',timezone:'Asia/Tokyo',startDate:null,days:[{offset:0,title:'Day',stops:[{title:'Unverified imported place',travellerNote:'PRIVATE import note',startMinuteOfDay:null,durationMinutes:null}]}],pendingPhotos:[{name:'original.jpg',mime:'image/jpeg',size:100}]}
it('double click, timeout replay and relogin request use one owner/source row',async()=>{
 const source=`local-${randomUUID()}`,args={p_source_id:source,p_request_id:randomUUID(),p_payload:payload}
 const first=await a.client.rpc('import_local_trip',args);expect(first.error).toBeNull()
 const replay=await a.client.rpc('import_local_trip',args);expect(replay.error).toBeNull();expect(replay.data).toEqual(first.data)
 expect((await a.client.rpc('import_local_trip',{...args,p_request_id:randomUUID()})).data.id).toBe(first.data.id)
 expect(first.data.days[0].stops[0].source).toBeNull();expect(first.data.pendingPhotos).toHaveLength(1)
 expect((await a.client.rpc('import_local_trip',{...args,p_request_id:randomUUID(),p_payload:{...payload,title:'Changed'}})).error?.message).toContain('idempotency_conflict')
 const ownedByB=await b.client.rpc('import_local_trip',args);expect(ownedByB.error).toBeNull();expect(ownedByB.data.id).not.toBe(first.data.id)
})
it('rejects persona, source credit, excessive counts and depth before any row is committed',async()=>{
 const before=await a.client.from('trips').select('id')
 for(const invalid of [{...payload,ownerId:b.id},{...payload,payout:{amount:200}}, {...payload,days:[{offset:0,title:'Day',stops:[{...payload.days[0].stops[0],source:{creatorId:b.id}}]}]}, {...payload,days:Array.from({length:31},(_,offset)=>({offset,title:'Day',stops:payload.days[0].stops}))}]) {
  expect((await a.client.rpc('import_local_trip',{p_source_id:`local-${randomUUID()}`,p_request_id:randomUUID(),p_payload:invalid})).error).not.toBeNull()
 }
 expect((await a.client.from('trips').select('id')).data).toEqual(before.data)
})
it('retains unknown pending-photo metadata after reload, without inventing MIME or size',async()=>{
 const photos=[{name:'original.heic',mime:null,size:null}]
 const first=await a.client.rpc('import_local_trip',{p_source_id:`local-${randomUUID()}`,p_request_id:randomUUID(),p_payload:{...payload,pendingPhotos:photos}})
 expect(first.error).toBeNull()
 const reload=await a.client.rpc('get_trip_snapshot',{p_trip_id:first.data.id})
 expect(reload.error).toBeNull();expect(reload.data.pendingPhotos).toEqual(photos)
 for(const photo of [{name:'broken',mime:null,size:123},{name:'broken',mime:'image/jpeg',size:null}])expect((await a.client.rpc('import_local_trip',{p_source_id:`local-${randomUUID()}`,p_request_id:randomUUID(),p_payload:{...payload,pendingPhotos:[photo]}})).error?.message).toContain('invalid_import')
})
