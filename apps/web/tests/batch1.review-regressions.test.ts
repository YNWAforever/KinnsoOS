import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {afterAll,expect,it} from 'vitest'
import {actor,admin,cleanup,guide,trip} from './helpers/kinnso-local'
afterAll(cleanup,60000)
const content={days:[{offset:0,title:'Day',stops:[{title:'Authored stop',description:'Distinct creator instructions',placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]}
it('null revision/version adoption is refused atomically',async()=>{
 const c=await actor(true),a=await actor(),id=await guide(c.client,c.id),t=await trip(a.client)
 expect((await c.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content})).error).toBeNull()
 for(const invalid of [{p_expected_revision:null,p_version:1},{p_expected_revision:1,p_version:null},{p_expected_revision:0,p_version:1}])expect((await a.client.rpc('adopt_guide_to_trip',{p_guide_id:id,p_trip_id:t.id,p_request_id:randomUUID(),...invalid})).error?.message).toContain('invalid_command')
 expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:t.id})).data).toMatchObject({revision:1,days:[]})
})
it('adopted source instructions remain separate from private notes after edit and reload',async()=>{
 const c=await actor(true),a=await actor(),id=await guide(c.client,c.id),t=await trip(a.client)
 expect((await c.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content})).error).toBeNull()
 const saved=await a.client.rpc('adopt_guide_to_trip',{p_guide_id:id,p_version:1,p_trip_id:t.id,p_expected_revision:1,p_request_id:randomUUID()});expect(saved.error).toBeNull();const stop=saved.data.days[0].stops[0]
 expect(stop.sourceDescription).toBe('Distinct creator instructions');expect(stop.travellerNote).toBe('')
 expect((await a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:2,p_request_id:randomUUID(),p_command:{type:'updateStop',id:stop.id,patch:{travellerNote:'My private instruction'}}})).error).toBeNull()
 expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:t.id})).data.days[0].stops[0]).toMatchObject({sourceDescription:'Distinct creator instructions',travellerNote:'My private instruction'})
})
it('fresh suspension refuses queued publication and withdrawal without touching traveller revisions',async()=>{
 const c=await actor(true),a=await actor(),id=await guide(c.client,c.id),t=await trip(a.client)
 expect((await c.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content})).error).toBeNull();expect((await a.client.rpc('adopt_guide_to_trip',{p_guide_id:id,p_version:1,p_trip_id:t.id,p_expected_revision:1,p_request_id:randomUUID()})).error).toBeNull()
 expect((await admin.from('creators').update({status:'suspended'}).eq('id',c.id)).error).toBeNull()
 expect((await c.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:1,p_request_id:randomUUID(),p_content:content})).error?.message).toContain('creator_required')
 expect((await c.client.rpc('withdraw_guide_versions',{p_guide_id:id})).error?.message).toContain('creator_required')
 expect((await a.client.rpc('get_trip_snapshot',{p_trip_id:t.id})).data.revision).toBe(2)
})
it('revoked captured JWT cannot use legacy or new trip writes or direct private reads',async()=>{
 const a=await actor(),t=await trip(a.client),token=(await a.client.auth.getSession()).data.session!.access_token
 const captured=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})
 expect((await a.client.auth.signOut({scope:'local'})).error).toBeNull()
 const mutations:[string,object][]=[['create_trip',{p_title:'Revoked creation'}],['update_trip',{p_trip_id:t.id,p_expected_revision:1,p_title:'Revoked update'}],['delete_trip',{p_trip_id:t.id,p_expected_revision:1}],['create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Revoked new creation'}}],['apply_trip_command',{p_trip_id:t.id,p_expected_revision:1,p_request_id:randomUUID(),p_command:{type:'patchTrip',patch:{title:'Revoked command'}}}],['delete_trip_v2',{p_trip_id:t.id,p_expected_revision:1,p_request_id:randomUUID()}]]
 for(const [name,args] of mutations)expect((await captured.rpc(name,args)).error?.message,name).toContain('unauthenticated')
 expect((await captured.from('trips').select('id').eq('id',t.id)).data).toEqual([]);expect((await admin.from('trips').select('title,head_revision_no').eq('id',t.id).single()).data).toMatchObject({title:'Synthetic traveller itinerary',head_revision_no:1})
})
it('concurrent media reattachment has exactly one revision winner',async()=>{
 const a=await actor();let t=await trip(a.client);const day=randomUUID(),stops=[randomUUID(),randomUUID(),randomUUID()]
 t=(await a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:randomUUID(),p_command:{type:'addDay',id:day,offset:0,title:'Day'}})).data
 for(const [position,id] of stops.entries())t=(await a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:randomUUID(),p_command:{type:'addStop',id,dayId:day,position,input:{title:'Stop '+position,placeId:null,travellerNote:'',startMinuteOfDay:null,durationMinutes:null}}})).data
 const intent=await a.client.rpc('prepare_trip_upload',{p_trip_id:t.id,p_request_id:randomUUID(),p_mime:'image/png',p_size:68});expect(intent.error).toBeNull();expect((await admin.from('kinnso_trip_media').update({state:'ready'}).eq('id',intent.data.id)).error).toBeNull()
 t=(await a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:randomUUID(),p_command:{type:'attachMedia',mediaId:intent.data.id,stopId:stops[0]}})).data
 const results=await Promise.all(stops.slice(1).map(stopId=>a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:randomUUID(),p_command:{type:'attachMedia',mediaId:intent.data.id,stopId}})))
 expect(results.filter(result=>!result.error)).toHaveLength(1);expect(results.find(result=>result.error)?.error?.message).toContain('trip_revision_conflict');expect(results.find(result=>!result.error)?.data.revision).toBe(t.revision+1)
})
it('a captured JWT loses direct private SELECT access when its session is revoked',async()=>{
 const a=await actor(),t=await trip(a.client),token=(await a.client.auth.getSession()).data.session!.access_token
 const captured=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})
 expect((await a.client.auth.signOut({scope:'local'})).error).toBeNull();expect((await captured.from('trips').select('id').eq('id',t.id)).data).toEqual([])
})
