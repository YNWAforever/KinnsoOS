import {checkBackendHealth} from '../../../lib/operational-api/health';

export async function GET(){
 const up=await checkBackendHealth();
 return Response.json({ok:up,db:up?'up':'down'},{headers:{'Cache-Control':'no-store'}});
}
