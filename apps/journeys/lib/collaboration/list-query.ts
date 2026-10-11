export type CollaborationListQuery={q?:string;status?:string;after?:string;sort?:'recent'|'deadline'};
export type CollaborationListScope='merchant'|'mine'|'available';
export const collaborationStates:Record<CollaborationListScope,readonly string[]>={merchant:['draft','published','paused','completed','cancelled','applied','submitted','revision_requested'],mine:['invited','applied','active','completed','cancelled','rejected','submitted','revision_requested'],available:['published']};
export function collaborationListQuery(params:URLSearchParams,scope:CollaborationListScope):CollaborationListQuery{
 const allowed=['q','status','after','sort'];
 for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw Error('INVALID');
 const q=params.get('q')?.trim(),status=params.get('status')??undefined,after=params.get('after')??undefined,sort=params.get('sort')??undefined;
 if((q?.length??0)>100||status!==undefined&&!collaborationStates[scope].includes(status)||sort!==undefined&&!['recent','deadline'].includes(sort)||after!==undefined&&(after.length>1500||!/^v1\.[A-Za-z0-9_-]+$/.test(after)))throw Error('INVALID');
 return{...q?{q}:{},...status?{status}:{},...after?{after}:{},...sort?{sort:sort as 'recent'|'deadline'}:{}};
}
export function changeListFilter(_previous:CollaborationListQuery,next:CollaborationListQuery):CollaborationListQuery{return{...next.q?{q:next.q.trim()}:{},...next.status?{status:next.status}:{},sort:next.sort??'recent'};}
export function sameCompanyLocation(params:Pick<URLSearchParams,'getAll'>,merchantId:string){const companies=params.getAll('company');return companies.length===0||companies.length===1&&companies[0]===merchantId;}
export function readListLocation(scope:CollaborationListScope,merchantId?:string):CollaborationListQuery{
 if(typeof window==='undefined')return {};
 const selected=new URLSearchParams();const params=new URLSearchParams(window.location.search);
 for(const key of ['q','status','sort','after'])for(const value of params.getAll(key))selected.append(key,value);
 if(scope==='merchant'&&merchantId&&!sameCompanyLocation(params,merchantId))selected.delete('after');
 return collaborationListQuery(selected,scope);
}
export function writeListLocation(query:CollaborationListQuery&{campaignId?:string},scope?:'mine'|'available',merchantId?:string){
 if(typeof window==='undefined')return;
 const params=new URLSearchParams(window.location.search);for(const key of ['q','status','sort','after'])params.delete(key);
 for(const [key,value]of Object.entries(query))if(['q','status','sort','after'].includes(key)&&value)params.set(key,value);
 if(merchantId){params.set('company',merchantId);params.delete('campaign');}
 if(query.campaignId)params.set('campaign',query.campaignId);
 if(scope)params.set('scope',scope);
 window.history?.replaceState(null,'',window.location.pathname+(params.size?'?'+params:''));
}
