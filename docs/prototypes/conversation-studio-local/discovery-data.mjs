// Original fictional text authored solely for the local review. No real provider data.
import {hashValue} from '../../../apps/journeys/lib/discovery/policy.ts';
export const DISCOVERY_COMPANIES=[
 {id:'a1000000-0000-4000-8000-000000000001',name:'海旁小店（示例）',role:'owner',locationId:'location-a'},
 {id:'a1000000-0000-4000-8000-000000000002',name:'山城生活（示例）',role:'owner',locationId:'location-b'},
 {id:'a1000000-0000-4000-8000-000000000003',name:'品牌工作室（示例）',role:'marketing',locationId:'location-c'}
];
export const FIXTURE_RIGHTS='fixture:original:kinnso-discovery-v1';
export async function offerHash(offer){
 const {offerId,revision,sourceLocationId,title,details,terms,validFrom,validUntil,priceAmount,currency,claims,prohibitedTerms}=offer;
 const normalized=priceAmount===null?null:priceAmount.split('.')[0]+'.'+(priceAmount.split('.')[1]??'').padEnd(2,'0');
 return hashValue({offerId,revision,sourceLocationId,title,details,terms,validFrom,validUntil,priceAmount:normalized,currency,claims,prohibitedTerms});
}
export async function discoveryOffers(now=()=>Date.now()){
 const entries=[
 ['harbour-walk','location-a','海旁慢步小休（示例）','沿著虛構海旁步道，停下來喝一杯示例茶。','每位 HKD 128.50；示例內容，不可預訂或兌換。','128.50','HKD'],
 ['hill-story',null,'山城故事工作坊（示例）','用原創小卡記錄一段虛構街道故事。','價格待確認；本機示例沒有名額或合作承諾。',null,null],
 ['courtyard-time','location-a','庭院時光（示例）','在示例庭院畫一幅屬於自己的小地圖。','每位 TWD 300；不提供換匯或真實交易。','300','TWD']
 ];
 return Promise.all(entries.map(async([offerId,sourceLocationId,title,details,terms,priceAmount,currency])=>{
 const offer={offerId,revision:1,sourceLocationId,appliedLocationId:sourceLocationId??'location-a',title,details,terms,validFrom:'2026-11-01',validUntil:'2027-01-31',priceAmount,currency,claims:[],prohibitedTerms:['保證收入'],observedAt:new Date(now()).toISOString(),sourceStatus:'confirmed',rightsState:'unverified_for_kinnso_reuse'};
 return {...offer,hash:await offerHash(offer)};
 }));
}
