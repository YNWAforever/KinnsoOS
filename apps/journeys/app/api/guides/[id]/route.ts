import {serverClient} from '../../../../lib/supabase/server';
import {backendFailure,failure,reply} from '../../../../lib/api/server';
import {uuid} from '../../../../lib/api/validation';
import {currentActor} from '../../../../lib/auth/actor';
import {successEvent} from '../../../../lib/telemetry/server';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const client=await serverClient();if(!client)return failure('UNAVAILABLE',503);
 const {id}=await params;if(!uuid(id))return failure('NOT_FOUND',404);
 const result=await client.rpc('kinnso_guide',{p_guide_id:id});
 if(!result.error&&result.data)try{await successEvent(await currentActor(),'guide_viewed',crypto.randomUUID());}catch{}
 return result.error?backendFailure(result.error):reply({ok:true,data:result.data});
}
