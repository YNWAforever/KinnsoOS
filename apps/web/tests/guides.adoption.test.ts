import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
import { actor,anonymous,cleanup,guide,trip } from './helpers/kinnso-local'
let creator:Awaited<ReturnType<typeof actor>>, a:Awaited<ReturnType<typeof actor>>, b:Awaited<ReturnType<typeof actor>>, id:string
beforeAll(async()=>{creator=await actor(true);a=await actor();b=await actor();id=await guide(creator.client,creator.id)},60000)
afterAll(cleanup,60000)
const content = (title:string) => ({days:[{offset:0,title:'First day',stops:[{title,description:'Public description',placeId:null,startMinuteOfDay:600,durationMinutes:60}]}]})
describe('structured publication and owner adoption',()=>{
  it('summary has no invented days and travellers cannot publish versions',async()=>{
    const summary=await anonymous.rpc('kinnso_guide',{p_guide_id:id})
    expect(summary.error).toBeNull();expect(summary.data.kind).toBe('summary');expect(summary.data.days).toBeUndefined()
    const forged=await a.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content('Fake')})
    expect(forged.error?.message).toContain('creator_required')
  })
  it('author publishes v1; owner adopts atomic snapshot once, B is refused',async()=>{
    const publish=await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:0,p_request_id:randomUUID(),p_content:content('Verified authored stop')})
    expect(publish.error).toBeNull();expect(publish.data.version).toBe(1)
    const source=await anonymous.rpc('kinnso_guide',{p_guide_id:id});expect(source.data.kind).toBe('itinerary')
    const t=await trip(a.client),request=randomUUID(),args={p_guide_id:id,p_version:1,p_trip_id:t.id,p_expected_revision:t.revision,p_request_id:request}
    expect((await b.client.rpc('adopt_guide_to_trip',args)).error?.message).toContain('trip_not_found')
    const adopted=await a.client.rpc('adopt_guide_to_trip',args);expect(adopted.error).toBeNull()
    expect(adopted.data.revision).toBe(2);expect(adopted.data.days[0].stops[0].source.guideVersion).toBe(1)
    expect((await a.client.rpc('adopt_guide_to_trip',args)).data).toEqual(adopted.data)
    const stop=adopted.data.days[0].stops[0]
    const edit=await a.client.rpc('apply_trip_command',{p_trip_id:t.id,p_expected_revision:2,p_request_id:randomUUID(),p_command:{type:'updateStop',id:stop.id,patch:{travellerNote:'PRIVATE retained note'}}})
    expect(edit.error).toBeNull()
    const v2=await creator.client.rpc('publish_guide_version',{p_guide_id:id,p_expected_version:1,p_request_id:randomUUID(),p_content:content('Version two stop')});expect(v2.error).toBeNull()
    const retained=await a.client.rpc('get_trip_snapshot',{p_trip_id:t.id})
    expect(retained.data.days[0].stops[0].title).toBe('Verified authored stop');expect(retained.data.days[0].stops[0].travellerNote).toBe('PRIVATE retained note')
    const withdraw=await creator.client.rpc('withdraw_guide_versions',{p_guide_id:id});expect(withdraw.error).toBeNull()
    const withdrawnSnapshot=await a.client.rpc('get_trip_snapshot',{p_trip_id:t.id});expect(withdrawnSnapshot.data.revision).toBe(4)
    const blocked=await a.client.rpc('adopt_guide_to_trip',{...args,p_request_id:randomUUID(),p_expected_revision:withdrawnSnapshot.data.revision,p_version:2});expect(blocked.error?.message).toContain('source_unavailable')
    const preserved=await a.client.rpc('get_trip_snapshot',{p_trip_id:t.id});expect(preserved.data.days[0].stops[0].travellerNote).toBe('PRIVATE retained note');expect(preserved.data.days[0].stops[0].source.withdrawn).toBe(true)
  },30000)
  it('desired bookmark state is replay safe and does not create trips',async()=>{
    const request=randomUUID(),args={p_guide_id:id,p_desired_state:true,p_request_id:request}
    const before=await a.client.from('trips').select('id')
    const saved=await a.client.rpc('kinnso_bookmark',args);expect(saved.error).toBeNull();expect((await a.client.rpc('kinnso_bookmark',args)).data).toEqual(saved.data)
    const rows=await a.client.from('guide_saves').select('id').eq('guide_id',id);expect(rows.data).toHaveLength(1)
    expect((await b.client.from('guide_saves').select('id').eq('guide_id',id)).data).toHaveLength(0)
    expect((await a.client.from('trips').select('id')).data).toEqual(before.data)
    expect((await a.client.rpc('kinnso_bookmark',{p_guide_id:id,p_desired_state:false,p_request_id:randomUUID()})).data.saved).toBe(false)
  })
})
