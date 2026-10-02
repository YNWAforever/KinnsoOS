import {apiContext,backendFailure,failure} from '../../../../lib/api/server';
import {uuid} from '../../../../lib/api/validation';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const ctx=await apiContext(request,'media');if(ctx.response)return ctx.response;
 const {id}=await params;if(!uuid(id))return failure('NOT_FOUND',404);
 const metadata=await ctx.client.from('kinnso_trip_media').select('object_path,mime,state,trip_id').eq('id',id).eq('attached',true).single();if(metadata.error||metadata.data.state!=='ready')return failure('NOT_FOUND',404);
 const current=await ctx.client.rpc('get_trip_snapshot',{p_trip_id:metadata.data.trip_id});if(current.error)return failure('NOT_FOUND',404);
 const result=await ctx.client.storage.from('kinnso-trip-private').download(metadata.data.object_path);if(result.error)return backendFailure(result.error);
 return new Response(result.data,{headers:{'Content-Type':metadata.data.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
}
