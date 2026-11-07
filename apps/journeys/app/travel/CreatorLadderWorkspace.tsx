'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';
import type {PerkRedemption} from '../../lib/creators/ladder';

type Progress={tier:string;nextTier:string|null;points:number;pointsIntoTier:number;pointsForNext:number|null;pct:number};
type Event={id:string;eventType:string;points:number;createdAt:string};
type Perk={id:string;slug:string;partnerName:string;title:string;summary:string;category:string;discountLabel:string;minTier:string|null;redemptionType:'code'|'link';sortOrder:number;eligible:boolean;redeemed:boolean};
type Ladder={progress:Progress;events:Event[];nextTierPerks:{title:string;partnerName:string}[];perksAvailable:boolean};
type Catalog={tier:string;items:Perk[]};

export function CreatorLadderWorkspace({actorId,enabled,path}:{actorId:string|null;enabled:boolean;path:'studio/tier'|'studio/perks'}){
 const{locale,t,href}=useApp(),mode=path==='studio/perks'?'perks':'tier';
 const[valid,setValid]=useState(true),[ladder,setLadder]=useState<Ladder|null>(null),[catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[opened,setOpened]=useState<Record<string,PerkRedemption>>({});
 const generation=useRef(0),pending=useRef(new Map<string,string>());
 useEffect(()=>{setValid(true);const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;setValid(false);setLadder(null);setCatalog(null);setOpened({});setError('');setBusy(false);pending.current.clear();}});return()=>{generation.current++;unsubscribe();};},[actorId]);
 useEffect(()=>{const own=++generation.current;pending.current.clear();setBusy(false);setOpened({});setError('');setLadder(null);setCatalog(null);if(!actorId||!enabled)return;
  void fetch(mode==='tier'?'/api/creator/ladder':'/api/creator/perks',{cache:'no-store'}).then(async response=>{const body=await response.json();if(own!==generation.current)return;if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');mode==='tier'?setLadder(body.data):setCatalog(body.data);}).catch((next:unknown)=>{if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');});
  return()=>{generation.current++;};
 },[actorId,enabled,mode]);
 async function redeem(perk:Perk){
  if((!perk.eligible&&!perk.redeemed)||busy||!valid||!actorId||!enabled)return;
  const own=generation.current;
  const requestId=pending.current.get(perk.id)??crypto.randomUUID();
  pending.current.set(perk.id,requestId);
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/creator/perks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,perkId:perk.id}),cache:'no-store'}),body=await response.json();
   if(own!==generation.current)return;
   if(!response.ok||!body.ok){
    if(response.status>=400&&response.status<500&&body.ok===false&&body.retryable===false)pending.current.delete(perk.id);
    throw Error(body.code??'UNAVAILABLE');
   }
   const revealed:PerkRedemption=body.data;
   setOpened(previous=>({...previous,[perk.id]:revealed}));pending.current.delete(perk.id);
   setCatalog(previous=>previous?{...previous,items:previous.items.map(item=>item.id===perk.id?{...item,redeemed:true}:item)}:previous);
  }catch(next){if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');}
  finally{if(own===generation.current)setBusy(false);}
 }
 if(!enabled)return <section className="k-page"><h1>{mode==='tier'?t('Creator tier','創作者級別'):t('Partner perks','夥伴禮遇')}</h1><p role="status">{t('Creator rewards are not connected yet.','創作者獎勵尚未接通。')}</p></section>;
 if(!actorId||!valid)return <section className="k-page"><h1>{mode==='tier'?t('Creator tier','創作者級別'):t('Partner perks','夥伴禮遇')}</h1><Link href={`/${locale}/sign-in?next=${encodeURIComponent('/'+locale+'/'+path)}`}>{t('Sign in to continue','登入後繼續')}</Link></section>;
 return <section className="k-page"><div className="k-page-heading"><div><p className="k-eyebrow">{t('YOUR STUDIO','你的工作室')}</p><h1>{mode==='tier'?t('Creator tier','創作者級別'):t('Partner perks','夥伴禮遇')}</h1></div><Link className="k-btn" href={href(mode==='tier'?'studio/perks':'studio/tier')}>{mode==='tier'?t('View perks','查看禮遇'):t('View tier progress','查看級別進度')}</Link></div>
  {error&&<p role="alert">{t('Rewards request failed: ','獎勵請求失敗：')}{error}</p>}
  {!ladder&&!catalog&&!error&&<p role="status">{t('Loading creator rewards…','正在載入創作者獎勵…')}</p>}
  {mode==='tier'&&ladder&&<><div className="k-card"><h2>{ladder.progress.tier}</h2><p>{ladder.progress.points} {t('contribution points','貢獻分')}</p><progress max={100} value={ladder.progress.pct}>{ladder.progress.pct}%</progress>{ladder.progress.nextTier?<p>{ladder.progress.pointsForNext} {t('points to','分距離')} {ladder.progress.nextTier}</p>:<p>{t('You are at the top tier.','你已達到最高級別。')}</p>}</div>
   {ladder.perksAvailable?<div className="k-card"><h2>{t('What the next tier unlocks','下一級別可解鎖')}</h2>{ladder.nextTierPerks.length?ladder.nextTierPerks.map(perk=><p key={perk.partnerName+':'+perk.title}>{perk.title} · {perk.partnerName}</p>):<p>{t('No additional perk is listed for the next tier.','下一級別未列出額外禮遇。')}</p>}</div>:<p role="alert">{t('Perk availability could not be verified.','未能核實禮遇供應情況。')}</p>}
   <div className="k-card"><h2>{t('Contribution history','貢獻紀錄')}</h2>{ladder.events.length===0?<p>{t('No contribution events yet.','暫未有貢獻紀錄。')}</p>:ladder.events.map(event=><p key={event.id}>{event.eventType.replaceAll('_',' ')} · +{event.points} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString(locale)}</time></p>)}</div></>}
  {mode==='perks'&&catalog&&<><p>{t('Current tier','目前級別')}: {catalog.tier}</p><div className="k-card-list">{catalog.items.map(perk=>{const revealed=opened[perk.id];return <article className="k-card" key={perk.id}><p className="k-eyebrow">{perk.category} · {perk.partnerName}</p><h2>{perk.title}</h2><p>{perk.summary}</p><p>{perk.discountLabel}{perk.minTier&&' · '+t('Requires ','需要 ')+perk.minTier}</p><button className="k-btn primary" disabled={busy||(!perk.eligible&&!perk.redeemed)} onClick={()=>void redeem(perk)}>{perk.redeemed?t('Reveal perk','顯示禮遇'):perk.eligible?t('Redeem perk','兌換禮遇'):t('Tier required','需要更高級別')}</button>{revealed&&<div role="status"><p>{revealed.redemptionType==='link'?t('Redemption link','兌換連結'):t('Redemption code','兌換碼')}</p>{revealed.redemptionType==='link'?<a href={revealed.value} rel="noreferrer">{revealed.value}</a>:<strong>{revealed.value}</strong>}</div>}</article>;})}</div></>}
 </section>;
}
