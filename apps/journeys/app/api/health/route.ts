import {checkBackendHealth} from '../../../lib/operational-api/health';

export async function GET(){
 const up=await checkBackendHealth();
 const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
 const identity = process.env.KINNSO_LOCAL_BUILD_IDENTITY;
 if (process.env.KINNSO_ENVIRONMENT === 'local' && identity &&
     /^\{"head":"[0-9a-f]{40}","tree":"[0-9a-f]{40}","buildId":"[a-zA-Z0-9_-]{1,80}"\}$/.test(identity)) {
  headers['X-Kinnso-Local-Build'] = identity;
 }
 return Response.json({ok:up,db:up?'up':'down'},{headers});
}
