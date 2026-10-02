'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {guides} from '../../lib/guides/repository';
import {bookmarks} from '../../lib/bookmarks/repository';
import {trips} from '../../lib/trips/repository';
import type {GuideSummary,GuideSnapshot} from '../../lib/contracts/trips';
import {useApp} from './ui';
import {GuestPlanner} from './GuestPlanner';
export function GuideWorkspace({id,actorId}:{id:string;actorId:string|null}) {
 const {t,href}=useApp(),router=useRouter(),query=useSearchParams(),[guide,setGuide]=useState<GuideSummary|GuideSnapshot|null>(null),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[list,setList]=useState<{id:string;title:string;revision:number}[]>([]),[selected,setSelected]=useState('');
 const adoption=useRef<{key:string;id:string;revision:number}|null>(null);
 const lock=useRef(false),intent=useRef<{desired:boolean;id:string}|null>(null);
 useEffect(()=>{let active=true;void guides.get(id).then(r=>{if(active){if(r.ok)setGuide(r.data);else setMessage(r.code==='NOT_FOUND'?t('Guide not found.','找不到攻略。'):t('Guide could not be loaded.','未能載入攻略。'))}});if(actorId){void bookmarks.list().then(r=>{if(active&&r.ok)setSaved(r.data.some(row=>row.guide_id===id))});void trips.list().then(r=>{if(active&&r.ok)setList(r.data.items)})}return()=>{active=false}},[id,actorId]);
 async function toggle(desired:boolean,requestId?:string) {
  if(lock.current)return;
  if(!actorId){const next=href('g/'+id)+'?bookmark=1&requestId='+crypto.randomUUID();router.push(href('sign-in')+'?next='+encodeURIComponent(next));return}
  lock.current=true;setBusy(true);if(intent.current?.desired!==desired)intent.current={desired,id:requestId??crypto.randomUUID()};
  const result=await bookmarks.toggle(id,desired,intent.current.id);if(result.ok){setSaved(result.data.saved);intent.current=null;setMessage(t('Bookmark saved to your account','收藏已保存至你的帳戶'));router.replace(href('g/'+id))}else setMessage(t('Bookmark was not confirmed. Retry.','未確認收藏結果，請重試。'));setBusy(false);lock.current=false;
 }
 useEffect(()=>{if(actorId&&query.get('bookmark')==='1')void toggle(true,query.get('requestId')??undefined)},[actorId]);
 if(!guide)return <div className="k-page"><h1>{t('Published guide','已發布攻略')}</h1><p role="status">{message||t('Loading…','載入中…')}</p></div>;
 return <div className="k-page"><Link href={href('explore')}>{t('Explore','探索')}</Link><h1>{guide.title}</h1><p role="status">{message}</p><button className="k-btn" disabled={busy} onClick={()=>void toggle(!saved)}>{saved?t('Remove bookmark','取消收藏'):t('Bookmark guide','收藏攻略')}</button>
 {guide.kind==='summary'?<><p>{guide.summary}</p><p>{t('This is a summary guide. It has no structured itinerary to apply.','這是摘要攻略，未提供可套用的結構化行程。')}</p></>:<><p>{guide.creator.name} · v{guide.version}</p>{guide.days.map(d=><section key={d.id}><h2>{t('Day','第')} {d.offset+1} · {d.title}</h2>{d.stops.map(s=><article key={s.id}><h3>{s.title}</h3><p>{s.description}</p></article>)}</section>)}
 {actorId?<><label htmlFor={'guide-trip-'+id}>{t('Apply to a trip','套用至行程')}</label><select id={'guide-trip-'+id} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{t('Choose an existing trip','選擇現有行程')}</option>{list.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select><Link href={href('trips')}>{t('Create a trip first','先建立行程')}</Link><button className="k-btn primary" disabled={busy||!selected} onClick={async()=>{if(lock.current)return;const target=list.find(item=>item.id===selected);if(!target)return;lock.current=true;setBusy(true);const key=id+':'+guide.version+':'+target.id;if(adoption.current?.key!==key)adoption.current={key,id:crypto.randomUUID(),revision:target.revision};const result=await trips.adopt(id,guide.version,target.id,adoption.current.revision,adoption.current.id);if(result.ok)router.push(href('trips/'+result.data.id));else setMessage(result.code==='CONFLICT'?t('Trip changed. Reload before applying.','行程已有變更，請重新載入後套用。'):t('Application was not confirmed. Retry the same action or check your trip.','未確認套用结果；請重試同一操作或檢查行程。'));setBusy(false);lock.current=false}}>{t('Apply published itinerary','套用已發布行程')}</button></>:<GuestPlanner guide={guide}/>}</>}
 </div>
}
export function BookmarkWorkspace({actorId}:{actorId:string|null}) {
 const {t,href}=useApp(),[rows,setRows]=useState<{guide_id:string;guides:{id:string;slug:string;title:string}|null}[]|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;if(actorId)void bookmarks.list().then(r=>{if(active){if(r.ok)setRows(r.data);else setMessage(t('Bookmarks could not be loaded.','未能載入收藏。'))}});return()=>{active=false}},[actorId]);
 return <div className="k-page"><h1>{t('Your bookmarks','我的收藏')}</h1>{!actorId?<Link className="k-btn primary" href={href('sign-in')+'?next='+encodeURIComponent(href('saved'))}>{t('Sign in','登入')}</Link>:message?<p role="alert">{message}</p>:rows?<ul>{rows.map(row=><li key={row.guide_id}>{row.guides?<Link href={href('g/'+row.guide_id)}>{row.guides.title}</Link>:t('Source unavailable','來源未能提供')}</li>)}{!rows.length&&<li>{t('No bookmarks yet.','暫未有收藏。')}</li>}</ul>:<p role="status">{t('Loading…','載入中…')}</p>}</div>
}
