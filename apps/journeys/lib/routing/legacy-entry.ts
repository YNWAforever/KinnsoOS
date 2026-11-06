/** Only verified same-app page aliases. Never forward a mutation or auth callback. */
type LegacyEntry={pathname:string;campaignId?:string;search?:Record<string,string>};
export function legacyEntry(pathname:string,method:string):LegacyEntry|null {
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
 if(path==='admin')return{pathname:`/${locale}/ops`,search:{view:'overview'}};
 if(path==='admin/enquiries')return{pathname:`/${locale}/ops/support`};
 if(path==='admin/merchants/applications')return{pathname:`/${locale}/ops/merchants`};
 const adminResource=path.match(/^admin\/(creators|merchants)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
 if(adminResource)return{pathname:`/${locale}/ops`,search:{view:adminResource[1],...adminResource[1]==='creators'?{creator:adminResource[2]}:{merchant:adminResource[2]}}};
 const adminMission=path.match(/^admin\/missions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
 if(adminMission)return{pathname:`/${locale}/ops`,search:{missionId:adminMission[1]}};
 const adminViews:Record<string,{path?:string;view:string}>={};
 for(const view of ['bookings','creators','merchants','missions','perks','sessions','team','testimonials','users'])adminViews[`admin/${view}`]={view};
 for(const view of ['creators','merchants','team'])adminViews[`admin/${view}/directory`]={view};
 Object.assign(adminViews,{'admin/analytics':{view:'analytics'},'admin/creators/payouts':{view:'payouts'},'admin/missions/review':{view:'reviews'}});
 const adminEntry=adminViews[path];
 if(adminEntry)return{pathname:`/${locale}/${adminEntry.path??'ops'}`,search:{view:adminEntry.view}};
 const merchantSections:Record<string,string>={
  'merchants/creators':'creators','merchants/insights':'insights','merchants/missions':'missions','merchants/post':'post',
  'merchants/dashboard/creators':'creators','merchants/dashboard/missions':'missions','merchants/dashboard/offers':'offers','merchants/dashboard/redeem':'redeem',
  'merchants/dashboard/insights':'insights','merchants/dashboard/profile':'profile','merchants/dashboard/post':'post',
  'merchants/dashboard/experiences':'experiences','merchants/dashboard/bookings':'bookings','merchants/dashboard/budget':'budget',
 };
 if(path==='merchants/dashboard/experiences/new')return{pathname:`/${locale}/merchant`,search:{section:'experiences',mode:'new'}};
 const merchantExperience=path.match(/^merchants\/dashboard\/experiences\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(edit|availability)$/i);
 if(merchantExperience)return{pathname:`/${locale}/merchant`,search:{section:'experiences',mode:merchantExperience[2].toLowerCase(),experience:merchantExperience[1]}};
 if(path==='merchants/apply'||path==='merchants/dashboard')return{pathname:`/${locale}/merchant`};
 const merchantSection=merchantSections[path];
 if(merchantSection)return{pathname:`/${locale}/merchant`,search:{section:merchantSection}};
 if(path==='creators/apply')return{pathname:`/${locale}/studio`};
 const mapped=path==='creator'?'studio':path;
 const destination=`/${locale}${mapped?'/'+mapped:''}`;
 return destination===pathname?null:{pathname:destination};
}
