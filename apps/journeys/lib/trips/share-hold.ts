// Session hold written by SharePreview. This reader does not call the receipt
// API or the share-receipt keyring; an unreadable record stays unknown.
const PREFIX='kinnso:unconfirmed-share:v1:';
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const sameUuid=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const sameDate=(a:string,b:string)=>Date.parse(a)===Date.parse(b)&&
 (a.match(/\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/i)?.[1]??'').slice(3).replace(/0+$/,'')===(b.match(/\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/i)?.[1]??'').slice(3).replace(/0+$/,'');
const ids=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(uuid)&&new Set(value.map(id=>id.toLowerCase())).size===value.length;
const sameIds=(a:string[],b:string[])=>a.length===b.length&&a.every((id,index)=>sameUuid(id,b[index]));
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(item=>typeof item==='string');

export type ShareHoldV2={version:2;requestId:string;tripId:string;stopIds:string[];mediaIds:string[];expiresAt:string};
export type ShareHoldV1={version:1;tripId:string;stopIds:string[];mediaIds:string[];expiresAt:string};
export type ShareHold=ShareHoldV2|ShareHoldV1;
export type ListedShareHold={tripId:string|null;hold:ShareHold|null};
export type ShareHoldList={readable:true;items:ListedShareHold[]}|{readable:false;items:[]};
export type ShareHoldStorage={length:number;key:(index:number)=>string|null;getItem:(key:string)=>string|null};

export const shareHoldKey=(tripId:string)=>PREFIX+tripId.toLowerCase();

function validIntent(value:Record<string,unknown>,tripId:string):value is Record<string,unknown>&ShareHoldV2{
 return value.version===2&&uuid(value.requestId)&&uuid(value.tripId)&&sameUuid(value.tripId,tripId)&&ids(value.stopIds)&&ids(value.mediaIds)&&date(value.expiresAt);
}

export function parseShareHold(raw:string,tripId:string):ShareHold{
 const value:unknown=JSON.parse(raw);
 if(!record(value)||(value.version!==1&&value.version!==2)||typeof value.tripId!=='string'||!sameUuid(value.tripId,tripId)||!strings(value.stopIds)||!strings(value.mediaIds)||!date(value.expiresAt))throw Error('Invalid share recovery');
 if(value.version===2){
  if(!validIntent(value,tripId))throw Error('Invalid share intent');
  return {version:2,requestId:value.requestId,tripId:value.tripId,stopIds:[...value.stopIds],mediaIds:[...value.mediaIds],expiresAt:value.expiresAt};
 }
 return {version:1,tripId:value.tripId,stopIds:[...value.stopIds],mediaIds:[...value.mediaIds],expiresAt:value.expiresAt};
}

export function sameShareHold(a:ShareHold,b:ShareHold){
 if(a.version===2&&b.version===2)return sameUuid(a.requestId,b.requestId)&&sameUuid(a.tripId,b.tripId)&&sameDate(a.expiresAt,b.expiresAt)&&sameIds(a.stopIds,b.stopIds)&&sameIds(a.mediaIds,b.mediaIds);
 return a.version===b.version&&sameUuid(a.tripId,b.tripId)&&sameDate(a.expiresAt,b.expiresAt)&&sameIds(a.stopIds,b.stopIds)&&sameIds(a.mediaIds,b.mediaIds);
}

export function shareIntent(hold:ShareHoldV2){
 return {requestId:hold.requestId,tripId:hold.tripId,stopIds:[...hold.stopIds],mediaIds:[...hold.mediaIds],expiresAt:hold.expiresAt};
}

export function listShareHolds(storage:ShareHoldStorage):ShareHoldList{
 let count:number;
 try{count=storage.length;if(!Number.isInteger(count)||count<0||count>10000)return {readable:false,items:[]};}
 catch{return {readable:false,items:[]};}
 const items:ListedShareHold[]=[];
 for(let index=0;index<count;index++){
  let key:string|null;
  try{key=storage.key(index);}catch{return {readable:false,items:[]};}
  if(typeof key!=='string'||!key.startsWith(PREFIX))continue;
  const suffix=key.slice(PREFIX.length),tripId=uuid(suffix)?suffix:null;
  let raw:string|null;
  try{raw=storage.getItem(key);}catch{items.push({tripId,hold:null});continue;}
  if(typeof raw!=='string'||tripId===null){items.push({tripId,hold:null});continue;}
  try{items.push({tripId,hold:parseShareHold(raw,tripId)});}catch{items.push({tripId,hold:null});}
 }
 return {readable:true,items};
}
