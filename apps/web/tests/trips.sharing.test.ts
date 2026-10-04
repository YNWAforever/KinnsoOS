import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,expect,it} from 'vitest'
import {actor,anonymous,cleanup,trip} from './helpers/kinnso-local'
let a:Awaited<ReturnType<typeof actor>>,b:Awaited<ReturnType<typeof actor>>
beforeAll(async()=>{a=await actor();b=await actor()},60000);afterAll(cleanup,60000)
it('server-selected readonly projection never includes private notes; only owner creates/revokes',async()=>{
 let t=await trip(a.client);const day=randomUUID(),stop=randomUUID()
 t=(await a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:randomUUID(),p_command:{type:'addDay',id:day,offset:0,title:'Day'}})).data
 t=(await a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:randomUUID(),p_command:{type:'addStop',id:stop,dayId:day,position:0,input:{title:'Selected public title',placeId:null,travellerNote:'PRIVATE SHARE LEAK SENTINEL',startMinuteOfDay:600,durationMinutes:60}}})).data
 const args={p_trip_id:t.id,p_stop_ids:[stop],p_media_ids:[],p_expires_at:new Date(Date.now()+3600000).toISOString()}
 expect((await b.client.rpc('create_trip_share',args)).error?.message).toContain('trip_not_found')
 const share=await a.client.rpc('create_trip_share',args);expect(share.error).toBeNull();expect(share.data.token.length).toBe(64)
 const publicView=await anonymous.rpc('get_shared_trip',{p_token:share.data.token});expect(publicView.error).toBeNull();expect(JSON.stringify(publicView.data)).not.toContain('PRIVATE SHARE');expect(publicView.data.days[0].stops[0].travellerNote).toBeUndefined();expect(publicView.data.ownerId).toBeUndefined()
 expect((await b.client.rpc('revoke_trip_share',{p_share_id:share.data.id})).error?.message).toContain('share_not_found')
 expect((await a.client.rpc('revoke_trip_share',{p_share_id:share.data.id})).error).toBeNull()
 expect((await anonymous.rpc('get_shared_trip',{p_token:share.data.token})).error?.message).toContain('share_not_found')
})
it('unknown, expired, cross-trip selections and deletion all fail closed',async()=>{
 const t=await trip(a.client)
 expect((await anonymous.rpc('get_shared_trip',{p_token:'0'.repeat(64)})).error?.message).toContain('share_not_found')
 expect((await a.client.rpc('create_trip_share',{p_trip_id:t.id,p_stop_ids:[randomUUID()],p_media_ids:[],p_expires_at:new Date(Date.now()+3600000).toISOString()})).error?.message).toContain('invalid_share')
 expect((await a.client.rpc('create_trip_share',{p_trip_id:t.id,p_stop_ids:[],p_media_ids:[],p_expires_at:new Date(Date.now()-1000).toISOString()})).error?.message).toContain('invalid_share')
 const share=await a.client.rpc('create_trip_share',{p_trip_id:t.id,p_stop_ids:[],p_media_ids:[],p_expires_at:new Date(Date.now()+3600000).toISOString()});expect(share.error).toBeNull()
 expect((await a.client.rpc('delete_trip_v2',{p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:randomUUID()})).error).toBeNull()
 expect((await anonymous.rpc('get_shared_trip',{p_token:share.data.token})).error?.message).toContain('share_not_found')
})
it('owner can list and revoke existing shares after a reload, without recovering raw tokens',async()=>{
 const t=await trip(a.client),share=await a.client.rpc('create_trip_share',{p_trip_id:t.id,p_stop_ids:[],p_media_ids:[],p_expires_at:new Date(Date.now()+3600000).toISOString()})
 expect(share.error).toBeNull()
 const rows=await a.client.rpc('list_trip_shares',{p_trip_id:t.id})
 expect(rows.error).toBeNull();expect(rows.data.map((row:{id:string})=>row.id)).toContain(share.data.id)
 expect(JSON.stringify(rows.data)).not.toContain(share.data.token);expect(JSON.stringify(rows.data)).not.toContain('token_hash')
 expect((await b.client.rpc('list_trip_shares',{p_trip_id:t.id})).error?.message).toContain('trip_not_found')
 expect((await a.client.rpc('revoke_trip_share',{p_share_id:share.data.id})).error).toBeNull()
 expect((await a.client.rpc('list_trip_shares',{p_trip_id:t.id})).data).toEqual([])
})
