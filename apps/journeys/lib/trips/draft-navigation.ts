// Navigation validation is separate from Auth next validation: signup and
// recovery links are legitimate destinations, but external origins are not.
export function safeAppDestination(input:string):string|null{
 if(typeof input!=='string'||input.length>4096||!/^\/(en|zh-HK)(?:[/?#]|$)/.test(input))return null;
 try{
  if(/[\\\u0000-\u001f\u007f-\u009f]/.test(decodeURIComponent(input)))return null;
  const url=new URL(input,'https://local.invalid');
  if(url.origin!=='https://local.invalid'||!/^\/(en|zh-HK)(?:\/|$)/.test(url.pathname))return null;
  return url.pathname+url.search+url.hash;
 }catch{return null}
}
