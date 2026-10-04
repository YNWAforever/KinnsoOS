export type PrivateTripHeading = {actorId:string;tripId:string;title:string};
type Client = {rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data?:unknown;error?:unknown}>};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A request-scoped user client enforces the RPC's ownership/session checks. No shared cache or service key. */
export async function readPrivateTripHeading(client:Client|null,actorId:string|null,tripId:string):Promise<PrivateTripHeading|null>{
 if(!client||!actorId||!uuid.test(tripId))return null;
 try{
  const result=await client.rpc('get_trip_snapshot',{p_trip_id:tripId});
  if(result.error||!result.data||typeof result.data!=='object')return null;
  const value=result.data as Record<string,unknown>;
  if(typeof value.id!=='string'||value.id.toLowerCase()!==tripId.toLowerCase()||typeof value.title!=='string'||!value.title.trim()||value.title.length>200)return null;
  return{actorId,tripId,title:value.title};
 }catch{return null;}
}
