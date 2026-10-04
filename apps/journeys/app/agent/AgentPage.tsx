'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import AgentWorkspace from './AgentWorkspace';
import {useApp} from '../travel/ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {trips} from '../../lib/trips/repository';
import {merchants,type Membership} from '../../lib/merchants/repository';
import type {TripSnapshot} from '../../lib/contracts/trips';
export function AgentPage({actorId,roles,enabled}:{actorId:string|null;roles:string[];enabled:boolean}){
 const {t,locale}=useApp();const epoch=useRef(0);
 const roleKey=[...roles].sort().join(',');
 const [choices,setChoices]=useState<Pick<TripSnapshot,'id'|'title'|'revision'>[]>([]),[cursor,setCursor]=useState<string|null>(null),[trip,setTrip]=useState<TripSnapshot|null>(null),[members,setMembers]=useState<Membership[]>([]),[merchantId,setMerchantId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[valid,setValid]=useState(true);
 function clear(){setChoices([]);setCursor(null);setTrip(null);setMembers([]);setMerchantId('');setBusy(false);setError('');}
 async function load(after?:string){const own=++epoch.current;setBusy(true);const [r,m]=await Promise.all([trips.list(after),roles.includes('merchant')?merchants.memberships():Promise.resolve(null)]);if(own!==epoch.current)return;setBusy(false);if(r.ok){setChoices(r.data.items);setCursor(r.data.nextCursor);}else{clear();setError(r.code);}if(m?.ok){const allowed=m.data.filter(x=>['owner','marketing'].includes(x.role));setMembers(allowed);setMerchantId(allowed[0]?.merchantId??'');}}
 useEffect(()=>{++epoch.current;clear();setValid(true);const unsub=subscribeAccountInvalidation(next=>{if(next!==actorId){++epoch.current;clear();setValid(false);}});if(actorId&&enabled)void load();return()=>{++epoch.current;unsub();};},[actorId,enabled,roleKey]);
 async function select(id:string){const own=++epoch.current;setTrip(null);if(!id)return;setBusy(true);const r=await trips.get(id);if(own!==epoch.current)return;setBusy(false);if(r.ok)setTrip(r.data);else{clear();setError(r.code);}}
 return <section className="k-page"><h1>{t('Task preview','任務預覽')}</h1>{!actorId||!valid?<Link href={`/${locale}/sign-in?next=/${locale}/agent`}>{t('Sign in','登入')}</Link>:!enabled?<p>{t('This service is not connected.','此服務尚未接通。')}</p>:<>{error&&<p role="alert">{t('Account data could not be read.','未能讀取帳戶資料。')}</p>}<label>{t('Your trip','你的行程')}<select aria-label={t('Your trip','你的行程')} value={trip?.id??''} disabled={busy} onChange={e=>void select(e.target.value)}><option value="">{t('Choose an owned trip','選擇自己的行程')}</option>{choices.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>{cursor&&<button className="k-btn" disabled={busy} onClick={()=>void load(cursor!)}>{t('Next trips','下一頁行程')}</button>}{members.length>0&&<label>{t('Merchant','商戶')}<select value={merchantId} disabled={busy} onChange={e=>setMerchantId(e.target.value)}>{members.map(m=><option key={m.merchantId} value={m.merchantId}>{m.name}</option>)}</select></label>}<AgentWorkspace actorId={actorId} roles={roles} initialTrip={trip} merchantId={merchantId||undefined} connected={enabled&&valid} contextLoading={busy}/></>}</section>;
}
