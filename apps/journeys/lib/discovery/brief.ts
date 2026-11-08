import type {DiscoveryStore,MatchedSourceInput,MatchedSourcesResult} from './contracts';
import type {StudioBrief,SourceDocument} from '../studio/contracts';
import {createBriefFromSources,assertSource} from '../studio/evidence.ts';
import {sourceRef} from '../studio/contracts.ts';
import {object,uuid} from './policy.ts';
export async function resolveMatchedSources(input:MatchedSourceInput,store:DiscoveryStore):Promise<MatchedSourcesResult>{
 try{object(input,['matchRunId','publicationId']);uuid(input.matchRunId);uuid(input.publicationId);return store.resolveSources?await store.resolveSources(input):{ok:false,code:'UNAVAILABLE',retryable:false};}catch{return {ok:false,code:'RESTRICTED',retryable:false};}
}
export function buildMatchedBrief(input:{id:string;threadId:string;title:string;city:string;summary:string;selectedSourceIds:string[]},sources:SourceDocument[]):StudioBrief{
 for(const s of sources.filter(s=>input.selectedSourceIds.includes(s.id)))assertSource(sourceRef(s),sources,'private');
 const brief=createBriefFromSources(input.id,input.threadId,sources,input.selectedSourceIds);
 return {...brief,title:input.title,city:input.city,summary:input.summary,blocks:brief.blocks.map(b=>({...b,title:sources.find(s=>s.id===b.id)?.title??'',intendedUse:'private'}))};
}
