/** The configured application origin is authoritative behind the hosting proxy. */
export function callbackOrigin(env:Record<string,string|undefined>):string|null {
 try {
  const url=new URL(env.KINNSO_SITE_URL??'');
  const local=env.KINNSO_ENVIRONMENT==='local'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||local&&url.protocol==='http:'))return null;
  return url.origin;
 }catch{return null;}
}
