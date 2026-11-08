export type MerchantOfferInput={
 title:string;terms:string;discountKind:'percent'|'amount'|'item';discountValue:string;commissionKind:'flat'|'percent';commissionValue:string;
 validFrom:string;validTo:string;perVisitorLimit:string;totalCap:string;missionId:string|null;
};
export type ParsedMerchantOffer=Omit<MerchantOfferInput,'discountValue'|'commissionValue'|'perVisitorLimit'|'totalCap'> & {
 discountValue:number;commissionValue:number;perVisitorLimit:number;totalCap:number|null;
};
const invalid=():never=>{throw Error('INVALID_OFFER')};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseMerchantOffer(value:unknown):ParsedMerchantOffer{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const row=value as Record<string,unknown>;
 const keys=['title','terms','discountKind','discountValue','commissionKind','commissionValue','validFrom','validTo','perVisitorLimit','totalCap','missionId'];
 if(Object.keys(row).some(key=>!keys.includes(key)))return invalid();
 const title=typeof row.title==='string'?row.title.trim():'',terms=typeof row.terms==='string'?row.terms.trim():'';
 const discountKind=row.discountKind,commissionKind=row.commissionKind;
 const discountValue=Number(row.discountValue),commissionValue=Number(row.commissionValue),perVisitorLimit=Number(row.perVisitorLimit);
 const totalCap=String(row.totalCap??'').trim()===''?null:Number(row.totalCap);
 const from=typeof row.validFrom==='string'?new Date(row.validFrom):new Date(NaN),to=typeof row.validTo==='string'?new Date(row.validTo):new Date(NaN);
 const missionId=row.missionId===null?null:row.missionId;
 if(title.length<1||title.length>120||terms.length<1||terms.length>1000||!['percent','amount','item'].includes(String(discountKind))||
  !['flat','percent'].includes(String(commissionKind))||!Number.isFinite(discountValue)||discountValue<=0||
  !Number.isFinite(commissionValue)||commissionValue<=0||(discountKind==='percent'&&discountValue>100)||(commissionKind==='percent'&&commissionValue>100)||
  Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||to<=from||!Number.isInteger(perVisitorLimit)||perVisitorLimit<=0||
  totalCap!==null&&(!Number.isInteger(totalCap)||totalCap<=0)||(missionId!==null&&(typeof missionId!=='string'||!uuid.test(missionId))))return invalid();
 return{title,terms,discountKind:discountKind as ParsedMerchantOffer['discountKind'],discountValue,commissionKind:commissionKind as ParsedMerchantOffer['commissionKind'],commissionValue,
  validFrom:from.toISOString(),validTo:to.toISOString(),perVisitorLimit,totalCap,missionId:missionId as string|null};
}
export function summarizeMerchantOffers(rows:{claimedCount:number;redeemedCount:number}[]){
 return rows.reduce((summary,row)=>({claimed:summary.claimed+row.claimedCount,redeemed:summary.redeemed+row.redeemedCount}),{claimed:0,redeemed:0});
}
