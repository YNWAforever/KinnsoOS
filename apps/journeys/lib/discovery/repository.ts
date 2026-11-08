import type {DiscoveryStore,DiscoveryIntent,DiscoveryRead,DiscoveryReadResult,DiscoveryCommandResult,DiscoveryReadback} from './contracts.ts';
/** Explicitly supplied adapter; no native API endpoint is enabled by importing this module. */
export function discoveryRepository(transport:<T>(path:string,method:string,body?:unknown)=>Promise<T>):DiscoveryStore{
 return {
  read:(scope:DiscoveryRead)=>transport<DiscoveryReadResult>('/reads','POST',scope),
  command:(intent:DiscoveryIntent)=>transport<DiscoveryCommandResult>('/commands','POST',intent),
  receipt:(id:string)=>transport<DiscoveryReadback>('/receipts/'+encodeURIComponent(id),'GET'),
  pending:()=>transport<DiscoveryIntent|null>('/pending','GET'),
  stage:async intent=>{await transport('/pending','POST',intent);},
  clear:async requestId=>{await transport('/pending','DELETE',{requestId});}
 };
}
