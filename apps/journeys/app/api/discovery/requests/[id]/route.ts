import {discoveryRequest} from '../../../../../lib/discovery/server';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params;return discoveryRequest(request,'receipt',id);
}
