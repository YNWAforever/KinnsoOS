import {sourceRef} from './contracts.ts';
import type {SourceDocument,SourceRef,StudioBrief,BriefBlock} from './contracts';
import {checkContentGrant} from '../discovery/offers.ts';
export function assertSource(ref:SourceRef,sources:SourceDocument[],purpose:'private'|'public',now=new Date()){
 const source=sources.find(s=>s.id===ref.sourceId);
 if(!source||source.status!=='active')throw Error('SOURCE_RESTRICTED');
 if(source.version!==ref.version||source.aclVersion!==ref.aclVersion||source.hash!==ref.hash)throw Error('SOURCE_STALE');
 if(source.rights==='licensed'){
  const license=source.license,grantPurpose=purpose==='public'?'public_guide':'private_brief';
  const grant=license?.grants.find(g=>g.purpose===grantPurpose&&!g.revokedAt);
  if(!license||!grant||license.fields.some(f=>!grant.allowedFields.includes(f))||!checkContentGrant(grant,license.provenance,grantPurpose,now).allowed)throw Error('SOURCE_UNVERIFIED');
 }else if(purpose==='public'&&source.rights!=='own')throw Error('SOURCE_UNVERIFIED');
 return source;
}
export function createBriefFromSources(id:string,threadId:string,sources:SourceDocument[],selectedIds:string[]):StudioBrief{
 const selected=[...new Set(selectedIds)].map(key=>{const s=sources.find(d=>d.id===key);if(!s||s.status!=='active')throw Error('SOURCE_RESTRICTED');assertSource(sourceRef(s),sources,'private');return s;});
 return{id,threadId,revision:0,title:'',city:'',summary:'',blocks:selected.map(s=>({id:s.id,title:'',text:s.text,sources:[sourceRef(s)],intendedUse:'private'}))};
}
/** Editing text does not grant rights or erase provenance. */
export function editBriefBlock(brief:StudioBrief,id:string,patch:Partial<BriefBlock>):StudioBrief{
 return{...brief,blocks:brief.blocks.map(b=>b.id===id?{...b,title:patch.title??b.title,text:patch.text??b.text,intendedUse:patch.intendedUse??b.intendedUse,sources:b.sources}:b)};
}
export function readableBrief(brief:StudioBrief,sources:SourceDocument[]):StudioBrief|null{
 try{for(const b of brief.blocks)for(const ref of b.sources)assertSource(ref,sources,'private');return brief;}catch{return null;}
}
