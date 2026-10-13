import type{CreatorMissionDetail}from'./collaboration';
export type PrivateCreatorMissionEntry={actorId:string;detail:CreatorMissionDetail};
type Client={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data?:unknown;error?:unknown}>};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Same per-request user/session RPC contract as the API; no shared cache or service key. */
export async function readPrivateCreatorMissionEntry(client:Client|null,actorId:string|null,missionId:string|null):Promise<PrivateCreatorMissionEntry|null>{
 if(!client||!uuid(actorId)||!uuid(missionId))return null;
 try{
  const actor=await client.rpc('kinnso_actor',{});if(actor.error||!object(actor.data)||actor.data.id!==actorId)return null;
  const result=await client.rpc('get_kinnso_creator_mission',{p_mission_id:missionId,p_submission_after:null}),value=result.data;
  if(result.error||!object(value)||!uuid(value.id)||value.id.toLowerCase()!==missionId.toLowerCase()||typeof value.title!=='string'||typeof value.summary!=='string'||!['requirements','deliverables','milestones','submissions','partnerLinks'].every(key=>Array.isArray(value[key])))return null;
  return{actorId,detail:value as CreatorMissionDetail};
 }catch{return null;}
}
