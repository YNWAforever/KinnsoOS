import {backendTarget,type Environment} from '../contracts/capabilities.ts';

export async function checkBackendHealth(env:Environment=process.env,transport:typeof fetch=fetch){
 const target=backendTarget(env);
 if(!target)return false;
 try{
  const url=new URL('/rest/v1/articles',target.origin);
  url.search=new URLSearchParams({select:'id',limit:'1'}).toString();
  const response=await transport(url,{method:'GET',headers:{apikey:target.key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  return response.ok;
 }catch{return false;}
}
