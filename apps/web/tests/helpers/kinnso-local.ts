import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertNonProductionTarget } from '../../../../scripts/verify-kinnso-target'
assertNonProductionTarget(process.env)
export const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export const anonymous = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
const created: string[] = []
export async function actor(creator = false) {
  const email = `synthetic-b1-${randomUUID()}@example.test`, password = `B1!${randomUUID()}`
  const result = await admin.auth.admin.createUser({ email, password, email_confirm:true })
  if (result.error) throw result.error
  const id = result.data.user!.id; created.push(id)
  if (creator) {
    const promoted = await admin.from('creators').update({status:'active',display_name:'Synthetic rights fixture'}).eq('id',id)
    if (promoted.error) throw promoted.error
  }
  const client = createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!)
  const signed = await client.auth.signInWithPassword({email,password}); if (signed.error) throw signed.error
  return {id,client}
}
export async function cleanup() {
  for (const id of created) { const result = await admin.auth.admin.deleteUser(id); if (result.error) throw result.error }
}
export async function trip(client:SupabaseClient) {
  const result = await client.rpc('create_trip_v2',{p_request_id:randomUUID(),p_payload:{title:'Synthetic traveller itinerary',timezone:'Asia/Tokyo',startDate:null}})
  if (result.error) throw result.error
  return result.data
}
export async function guide(client:SupabaseClient, id:string) {
  const result = await client.from('guides').insert({creator_id:id,creator_name:'Synthetic rights fixture',creator_handle:'synthetic',slug:`synthetic-${randomUUID()}`,title:'Synthetic structured route',summary:'Explicit test fixture, not live content',city:'Kyoto',cover_url:'',status:'published',published_at:new Date().toISOString()}).select('id').single()
  if (result.error) throw result.error
  return result.data.id as string
}
