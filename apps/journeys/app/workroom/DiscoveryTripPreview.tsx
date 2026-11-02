'use client';
import {useEffect,useState} from 'react';
import type {DiscoveryStore,TripSuggestionResult,TripIntent} from '../../lib/discovery/contracts';
export function DiscoveryTripPreview({store,intentId,publicationId,onUse}:{store:DiscoveryStore;intentId:string;publicationId:string;onUse:(intent:TripIntent)=>void}){
 const [value,setValue]=useState<TripSuggestionResult|null>(null);
 useEffect(()=>{let active=true;setValue(null);void store.tripSuggestion?.({intentId,publicationId}).then(r=>{if(active)setValue(r);}).catch(()=>{if(active)setValue({ok:false,code:'UNAVAILABLE',retryable:true});});return()=>{active=false;};},[store,intentId,publicationId]);
 return <section className="cs-card" aria-label="配對旅程參考"><h2>從私人配對帶來的參考</h2>{value?.ok?<><p>香港 · {value.intent.dateSpec.kind==='fixed'?value.intent.dateSpec.start+' 至 '+value.intent.dateSpec.end:'日期仍待決定'}</p><p>{value.offer.display?.title}</p><p>{value.offer.display?.terms}</p><p>這裏只帶入你自己的目的地與日期。商戶文字保留在參考卡；若要保存商戶內容，請使用已授權 guide 的 T2 採用流程。</p><button className="k-btn" onClick={()=>onUse(value.intent)}>使用這個目的地與日期</button></>:<p role="status">{value?'配對來源暫時無法核對。仍可手動使用原 T1 範本。':'正在核對你已選的配對…'}</p>}</section>;
}
