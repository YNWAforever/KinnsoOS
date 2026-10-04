import {serverClient} from '../../../../lib/supabase/server';
import {failure,reply} from '../../../../lib/api/server';
import {uuid} from '../../../../lib/api/validation';
import {currentActor} from '../../../../lib/auth/actor';
import {successEvent} from '../../../../lib/telemetry/server';
import {readPublicGuidePage} from '../../../../lib/seo/guide-publication';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const client=await serverClient();if(!client)return failure('UNAVAILABLE',503);
 const {id}=await params;if(!uuid(id))return failure('NOT_FOUND',404);
 try {
  const guide=await readPublicGuidePage(id,process.env);if(!guide)return failure('NOT_FOUND',404);
  try{await successEvent(await currentActor(),'guide_viewed',crypto.randomUUID());}catch{}
  return reply({ok:true,data:guide});
 } catch {return failure('UNAVAILABLE',503);}
}
