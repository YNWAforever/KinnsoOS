import {existsSync} from 'node:fs';import {randomUUID} from 'node:crypto';
const url=new URL('../../../../docs/prototypes/conversation-studio-local/discovery-backend.mjs',import.meta.url);
export const backend=existsSync(url)?(await import(url)).createDiscoveryBackend:undefined;
export const actor='22222222-2222-4222-8222-222222222222',company='a1000000-0000-4000-8000-000000000001';
export const now=()=>Date.parse('2026-11-01T04:00:00Z');
export const cmd=(kind,targetId,data={},expectedRevision=0,requestId=randomUUID())=>({requestId,targetId,expectedRevision,command:{kind,data}});
export async function publishedFixture(options={}){
 const b=options.backendInstance??backend({actorId:actor,now,...options}),linkId=randomUUID(),publicationId=randomUUID();
 const check=async c=>{const r=await b.command(c);if(!r.ok)throw Error(c.command.kind+':'+r.code);return r.receipt;};
 await check(cmd('beginLink',linkId,{companyId:company,locationIds:['location-a']}));
 const proof=await b.attestLink(linkId);await check(cmd('confirmLink',linkId,{proof,readRefreshAllowed:true},1));
 await check(cmd('importOffer',publicationId,{linkId,offerId:'harbour-walk',expectedSourceRevision:1,locationId:'location-a'}));
 let data=(await b.read({kind:'companyOffers',companyId:company})).data,pub=data.publications[0];
 await check(cmd('preparePublication',publicationId,{importId:pub.importId,cityKey:'city:hk:hong-kong',dateTimeZone:'Asia/Hong_Kong',priceBasis:'per_person',interestTags:['散步'],languages:['zh-HK'],audiences:['traveller','creator'],displayFields:['title','details','terms']},pub.revision));
 data=(await b.read({kind:'companyOffers',companyId:company})).data;pub=data.publications[0];
 await check(cmd('grantContentUse',publicationId,{publicationContentVersion:pub.contentVersion,allowedFields:['title','details','terms'],purposes:['catalog','matching','private_brief','public_guide','trip_adoption','trip_share'],expiresAt:'2027-02-01T00:00:00Z',rightsBasisRef:'fixture:original:kinnso-discovery-v1',previewDigest:pub.previewDigest,confirmed:true},pub.revision));
 pub=(await b.read({kind:'companyOffers',companyId:company})).data.publications[0];
 await check(cmd('publishOffer',publicationId,{contentVersion:pub.contentVersion,previewDigest:pub.previewDigest,confirmed:true},pub.revision));
 return {b,linkId,publicationId,check};
}
