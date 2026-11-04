'use client';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {useApp} from '../travel/ui';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {getStudioNavigation} from '../../lib/studio/navigation';
import {templateById} from '../../lib/studio/templates';
import {studioRepository} from '../../lib/studio/repository';
import {TemplateCards} from './TemplateCards';
import {TaskStarter} from './TaskStarter';
import {ThreadWorkspace} from './ThreadWorkspace';
import {CreatorTaskPanel} from './CreatorTaskPanel';
import {CreatorTaskFlow,CreatorReportLibrary} from './CreatorTaskFlow';
import type {CreatorReportStore,CreatorTaskId} from '../../lib/studio/creator-reports';
import {TravellerTaskFlow,TravellerBriefLibrary} from './TravellerTaskFlow';
import type {TravellerStore,TravellerTaskId} from '../../lib/studio/traveller-tasks';
import {MerchantTaskFlow} from './MerchantTaskFlow';
import type {MerchantTaskStore,MerchantTaskId} from '../../lib/studio/merchant-tasks';
import {ConnectionsPage} from './ConnectionsPage';
import {DiscoveryFlow} from './DiscoveryFlow';
import type {DiscoveryStore} from '../../lib/discovery/contracts';
import type {TemplateId} from '../../lib/studio/contracts';
import './workroom.css';
export function WorkroomShell({path,actorId,roles,enabled,handoffEnabled,creatorReportStore,travellerStore,merchantStore,discoveryStore}:{path:string;actorId:string|null;roles:string[];enabled:boolean;handoffEnabled:boolean;creatorReportStore?:CreatorReportStore;travellerStore?:TravellerStore;merchantStore?:MerchantTaskStore;discoveryStore?:DiscoveryStore}){
 const {t,href}=useApp(),router=useRouter(),query=useSearchParams();
 const [accountValid,setAccountValid]=useState(true);
 useEffect(()=>{setAccountValid(true);return subscribeAccountInvalidation(next=>{if(next!==actorId)setAccountValid(false);});},[actorId]);
 const task=templateById(query.get('template')??'C1'),generation=useRef(0),[recent,setRecent]=useState<{id:string;title:string}[]>([]),[recentError,setRecentError]=useState('');
 useEffect(()=>{const epoch=++generation.current;setRecent([]);setRecentError('');const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;setRecent([]);}});if(actorId&&enabled)void studioRepository(actorId).listThreads().then(r=>{if(generation.current!==epoch)return;if(r.ok)setRecent(r.data.items);else setRecentError(t('Recent discussions are unavailable.','最近討論暫時無法讀取。'));});return()=>{generation.current++;unsubscribe();};},[actorId,enabled,path]);
 const choose=(id:TemplateId)=>router.push(href('workroom')+'?template='+id);
 if(!accountValid)return <section className="cs-card"><p role="alert">{t('Account or source permissions changed. Sign in again and select permitted documents.','帳戶或來源權限已改變，請重新登入並選擇有權使用的文件。')}</p></section>;
 return <div className="cs-shell"><aside className="cs-sidebar"><details open={!((travellerStore||merchantStore)&&/^[TM][1-5]$/.test(task.id))}><summary>{t('Your workspace','你的工作室')}</summary><nav aria-label={t('Conversation studio navigation','對話工作室導覽')}>{discoveryStore&&<><Link href={href('workroom/discovery')}>旅程與優惠配對</Link><Link href={href('merchant/offer-discovery')}>商戶優惠展示</Link></>}<Link href={href('workroom')}>{t('New discussion','新的討論')}</Link><Link href={href('workroom/templates')}>{t('Templates','範本')}</Link><Link href={href('workroom/documents')}>{t('Documents','文件')}</Link>{merchantStore&&<Link href={href('workroom/merchant-results')}>商戶私人 brief 庫</Link>}{travellerStore&&<Link href={href('workroom/traveller-results')}>旅人私人 brief 庫</Link>}{creatorReportStore&&<Link href={href('workroom/reports')}>私人成果庫</Link>}<Link href={href('settings/connections')}>{t('Connected accounts','已連接帳號')}</Link>{getStudioNavigation(actorId?{roles}:null).filter(item=>!['workroom','settings/connections'].includes(item.path)).map(item=><Link key={item.path} href={href(item.path)}>{t(item.en,item.zh)}</Link>)}</nav><h3>{t('Recent discussions','最近討論')}</h3>{recent.map(item=><Link key={item.id} href={href('workroom/t/'+item.id)}>{item.title}</Link>)}{recentError&&<p role="status">{recentError}</p>}</details></aside>
 <div className="cs-content">{path==='merchant/offer-discovery'||path==='workroom/discovery'||path.startsWith('workroom/discovery/intents/')?<DiscoveryFlow actorId={actorId} store={discoveryStore} mode={path.startsWith('merchant/')?'merchant':'traveller'} intentId={path.split('/')[3]}/>:merchantStore&&actorId&&enabled&&path==='workroom/merchant-results'?<MerchantTaskFlow actorId={actorId} templateId="M1" store={merchantStore} library/>:merchantStore&&actorId&&enabled&&/^M[1-5]$/.test(task.id)&&path==='workroom'?<MerchantTaskFlow key={task.id+actorId} templateId={task.id as MerchantTaskId} actorId={actorId} store={merchantStore}/>:travellerStore&&actorId&&enabled&&path==='workroom/traveller-results'?<TravellerBriefLibrary actorId={actorId} store={travellerStore}/>:travellerStore&&actorId&&enabled&&/^T[1-5]$/.test(task.id)&&path==='workroom'?<TravellerTaskFlow key={task.id+actorId+query.get('run')} templateId={task.id as TravellerTaskId} actorId={actorId} store={travellerStore} discoveryStore={discoveryStore}/>:creatorReportStore&&actorId&&enabled&&roles.includes('creator')&&path==='workroom/reports'?<CreatorReportLibrary actorId={actorId} store={creatorReportStore}/>:path==='settings/connections'?<ConnectionsPage discoveryEnabled={!!discoveryStore}/>:path==='workroom/templates'?<TemplateCards ops={roles.includes('ops')} audience={query.get('audience')??undefined} onSelect={choose}/>:task.id==='C1'||path.startsWith('workroom/t/')||path==='workroom/documents'?<ThreadWorkspace key={actorId+':'+path} actorId={actorId} roles={roles} enabled={enabled} handoffEnabled={handoffEnabled} discoveryStore={discoveryStore} matchedContext={discoveryStore&&query.get('matchRunId')&&query.get('publicationId')?{matchRunId:query.get('matchRunId')!,publicationId:query.get('publicationId')!}:undefined} threadId={path.startsWith('workroom/t/')?path.split('/')[2]:undefined}/>:/^C[2-5]$/.test(task.id)?creatorReportStore&&actorId&&enabled&&roles.includes('creator')?<CreatorTaskFlow key={task.id+actorId+query.get('report')} templateId={task.id as CreatorTaskId} actorId={actorId} store={creatorReportStore}/>:<CreatorTaskPanel key={task.id+actorId} templateId={task.id} actorId={actorId} enabled={enabled}/>:<TaskStarter key={task.id+actorId} templateId={task.id} actorId={actorId}/>}</div>
 </div>;
}
