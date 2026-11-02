import {assertSource} from './evidence.ts';
import type {StudioBrief,SourceDocument,GuideProjection,SourceRef} from './contracts';
export function buildGuideProjection(brief:StudioBrief,selectedBlockIds:string[],sources:SourceDocument[]):GuideProjection{
 const selected=[...new Set(selectedBlockIds)].map(id=>{const b=brief.blocks.find(x=>x.id===id);if(!b)throw Error('INVALID_BLOCK');return b;});
 const refs=new Map<string,SourceRef>();
 for(const b of selected){
  if(b.intendedUse!=='public-candidate')throw Error('PRIVATE_BLOCK');
  if(!b.title.trim())throw Error('AUTHORED_STOP_REQUIRED');
  for(const ref of b.sources){assertSource(ref,sources,'public');refs.set(ref.sourceId,ref);}
 }
 return{blockIds:selected.map(b=>b.id),sources:[...refs.values()],payload:{title:brief.title,city:brief.city,summary:brief.summary,content:{days:selected.length?[{offset:0,title:'',stops:selected.map(b=>({title:b.title,description:b.text,placeId:null,startMinuteOfDay:null,durationMinutes:null}))}]:[]}}};
}
