import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {afterAll,expect,it} from 'vitest'
import {actor,admin,cleanup,trip} from './helpers/kinnso-local'
afterAll(cleanup,60000)
it('durable create/import/revisit events are replay-safe, content-free and separate ops context',async()=>{
 const a=await actor(),ops=await actor(),newcomer=await actor();expect((await newcomer.client.rpc('record_kinnso_return_visit')).data).toMatchObject({accepted:false});const t=await trip(a.client)
 const args={p_source_id:'metric-'+randomUUID(),p_request_id:randomUUID(),p_payload:{title:'PRIVATE metric fixture title',timezone:'UTC',days:[{offset:0,title:'Day',stops:[{title:'Private source',travellerNote:'PRIVATE metric note',startMinuteOfDay:null,durationMinutes:null}]}],pendingPhotos:[]}}
 expect((await a.client.rpc('import_local_trip',args)).error).toBeNull();expect((await a.client.rpc('import_local_trip',args)).error).toBeNull()
 expect((await a.client.rpc('record_kinnso_return_visit')).error).toBeNull();expect((await a.client.rpc('record_kinnso_return_visit')).error).toBeNull()
 expect((await admin.from('kinnso_ops_members').insert({user_id:ops.id,display_name:'Synthetic metric reviewer',status:'active'})).error).toBeNull();await trip(ops.client)
 const data=JSON.parse(execFileSync('docker',['exec',process.env.SUPABASE_DB_CONTAINER!,'psql','-U','postgres','-d','postgres','-Atc',`select coalesce(json_agg(e),'[]'::json) from kinnso_internal.traveller_events e where actor_id in ('${a.id}'::uuid,'${ops.id}'::uuid)`],{encoding:'utf8'}))
 expect(data.filter((e:{actor_id:string})=>e.actor_id===a.id).map((e:{event_name:string})=>e.event_name).sort()).toEqual(['return_visit','trip_created','trip_imported']);expect(data.find((e:{actor_id:string})=>e.actor_id===ops.id).actor_context).toBe('ops');expect(data.every((e:{app_mode:string})=>e.app_mode==='connected')).toBe(true)
 expect(JSON.stringify(data)).not.toContain(args.p_payload.title);expect(data.find((e:{event_name:string;actor_id:string})=>e.actor_id===a.id&&e.event_name==='trip_created').related_trip_id).toBe(t.id)
},30000)
