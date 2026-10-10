import {request} from '../trips/repository';
import type {CampaignCommand} from './campaigns';
export type DiscoveryQuery={q?:string;after?:string;savedOnly?:boolean;campaignsAfter?:string};
export type DiscoveredCreator={id:string;handle:string;name:string;bio:string;niches:string[];languages:string[];audienceGeos:string[];platforms:string[];guideCount:number;lastGuideAt:string|null;saved:boolean;note:string|null;savedUpdatedAt:string|null};
export type DiscoveryDirectory={items:DiscoveredCreator[];nextCursor:string|null;quota:{limit:number;used:number;remaining:number;periodStart:string};campaigns:{id:string;title:string;updatedAt:string}[];campaignsNextCursor:string|null};
export type DiscoveryReceipt={id:string;merchantId:string;operation:string;participantId?:string;updatedAt?:string};
export function discoveryQuery(params:URLSearchParams):DiscoveryQuery {
 const out:DiscoveryQuery={};
 for(const key of params.keys())if(!['q','after','savedOnly','campaignsAfter'].includes(key)||params.getAll(key).length!==1)throw Error('INVALID');
 if(params.has('q')){const q=params.get('q')!;if(q.length>100)throw Error('INVALID');out.q=q.trim();}
 if(params.has('savedOnly')){const value=params.get('savedOnly');if(value!=='true'&&value!=='false')throw Error('INVALID');out.savedOnly=value==='true';}
 for(const key of ['after','campaignsAfter'] as const)if(params.has(key)){const value=params.get(key)!;if(!value||value.length>1500||!/^[-_A-Za-z0-9]+$/.test(value))throw Error('INVALID');out[key]=value;}
 return out;
}
export const merchantCreators={
 list:(merchantId:string,query:DiscoveryQuery={})=>request<DiscoveryDirectory>('/api/merchant/creators?'+new URLSearchParams([['id',merchantId],...Object.entries(query).map(([k,v])=>[k,String(v)])])),
 command:(merchantId:string,command:CampaignCommand,requestId:string)=>request<DiscoveryReceipt>('/api/merchant/creators','POST',{merchantId,command,requestId}),
 receipt:(merchantId:string,requestId:string)=>request<{result:DiscoveryReceipt|null}>('/api/merchant/creators?'+new URLSearchParams({id:merchantId,requestId})),
};
