/** Only verified same-app page aliases. Never forward a mutation or auth callback. */
export function legacyEntry(pathname:string,method:string):{pathname:string;campaignId?:string}|null {
 if(!['GET','HEAD'].includes(method)||!/^\/(en|zh-hk|zh-HK)(?:\/|$)/.test(pathname))return null;
 try{
  const segments=pathname.split('/').slice(1);
  if(segments.some(segment=>{const decoded=decodeURIComponent(segment);return !decoded||decoded==='.'||decoded==='..'||! /^[\p{L}\p{M}\p{N}_.-]+$/u.test(decoded);}))return null;
 }catch{return null;}
 const [,language,...parts]=pathname.split('/');
 if(['auth','callback'].includes(decodeURIComponent(parts[0]??'')))return null;
 const locale=language==='zh-hk'?'zh-HK':language,path=parts.join('/');
 const campaign=path.match(/^merchants\/(?:dashboard\/)?missions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
 if(campaign)return{pathname:`/${locale}/merchant/campaigns/${campaign[1]}`,campaignId:campaign[1]};
 const mapped=path==='creator'?'studio':path;
 const destination=`/${locale}${mapped?'/'+mapped:''}`;
 return destination===pathname?null:{pathname:destination};
}
