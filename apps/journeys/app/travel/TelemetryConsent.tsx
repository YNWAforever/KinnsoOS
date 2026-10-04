'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useReportWebVitals} from 'next/web-vitals';
import {useApp} from './ui';
import {readConsent} from '../../lib/telemetry/events';
export function TelemetryConsent({enabled,fieldEnabled}:{enabled:boolean;fieldEnabled:boolean}){
 const {t}=useApp();const [decision,setDecision]=useState<'unknown'|'accepted'|'denied'>('unknown');const accepted=useRef(false),seen=useRef(new Set<string>()),intent=useRef(0),writes=useRef(Promise.resolve());
 const report=useCallback((metric:{name:string;value:number;id:string})=>{let consent=false;try{consent=readConsent(localStorage).consent==='accepted';}catch{}if(!accepted.current||!consent||!fieldEnabled||!['LCP','INP','CLS'].includes(metric.name)||seen.current.has(metric.id))return;seen.current.add(metric.id);void fetch('/api/telemetry/performance',{method:'POST',headers:{'Content-Type':'application/json','X-Kinnso-Analytics-Consent':'accepted'},body:JSON.stringify({requestId:crypto.randomUUID(),sample:{metric:metric.name,value:metric.value}}),keepalive:true}).catch(()=>{});},[fieldEnabled]);
 useReportWebVitals(report);
 useEffect(()=>{const sync=(event?:StorageEvent)=>{if(event){++intent.current;}try{const stored=localStorage.getItem('kinnso.analytics.consent.v1');accepted.current=readConsent(localStorage).consent==='accepted';setDecision(accepted.current?'accepted':stored==='denied'?'denied':'unknown');if(event&&stored==='denied')void choose(false);}catch{accepted.current=false;}};sync();window.addEventListener('storage',sync);return()=>{++intent.current;accepted.current=false;window.removeEventListener('storage',sync);};},[]);
 async function choose(value:boolean){const own=++intent.current;if(!value){accepted.current=false;setDecision('denied');try{localStorage.setItem('kinnso.analytics.consent.v1','denied');localStorage.removeItem('kinnso.analytics.journey.v1');localStorage.removeItem('kinnso.analytics.consent-version.v1');}catch{}}
 // Serialize Set-Cookie responses so the last decision also wins at the server.
 writes.current=writes.current.catch(()=>{}).then(async()=>{if(own!==intent.current)return;const r=await fetch('/api/telemetry/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted:value}),signal:AbortSignal.timeout(5000)}).catch(()=>null);if(!r?.ok||!value||own!==intent.current)return;accepted.current=true;setDecision('accepted');try{localStorage.setItem('kinnso.analytics.consent.v1','accepted');localStorage.setItem('kinnso.analytics.journey.v1',crypto.randomUUID());localStorage.setItem('kinnso.analytics.consent-version.v1','v1:'+(Date.now()+7*86400000));}catch{accepted.current=false;}});await writes.current;
 }
 if(!enabled)return null;
 return <aside className="k-card" aria-label={t('Measurement preference','量測選擇')}><p>{decision==='unknown'?t('Allow anonymous activity counts and performance measurements? Private trip text and messages are excluded.','允許匿名活動次數與效能量測？不包括私人行程文字及訊息。'):t('You can change your measurement preference.','你可以更改量測選擇。')}</p>{decision!=='accepted'&&<button className="k-btn" onClick={()=>void choose(true)}>{t('Allow measurement','允許量測')}</button>}{decision!=='denied'&&<button className="k-btn" onClick={()=>void choose(false)}>{t('Decline measurement','拒絕量測')}</button>}</aside>;
}
