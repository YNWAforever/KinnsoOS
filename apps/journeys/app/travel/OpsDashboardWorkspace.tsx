'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';
import {OpsRecordActions} from './OpsRecordActions';
import {OpsContentAdmin} from './OpsContentAdmin';

const views=[
 ['overview','Overview','總覽'],['pilot','Pilot control room','試行計劃控制室'],['creators','Creators','創作者'],['merchants','Merchants','商戶'],['missions','Missions','活動'],
 ['sessions','Sessions','活動及分享會'],['team','Team','團隊'],['perks','Perks','禮遇'],['testimonials','Testimonials','見證'],
 ['users','Users','用戶'],['enquiries','Enquiries','查詢'],['analytics','Analytics','分析'],
] as const;
const contentAdminViews=new Set(['sessions','perks','testimonials','enquiries']);
type Payload={view:string;status?:string;reason?:string;counts?:Record<string,number>;items?:Record<string,unknown>[];detail?:Record<string,unknown>|null;error?:string};
function scalar(value:unknown){return ['string','number','boolean'].includes(typeof value)&&String(value).length<=500}

export function OpsDashboardWorkspace({actorId,enabled,view,id}:{actorId:string|null;enabled:boolean;view:string;id:string|null}){
 const{locale,t,href}=useApp(),[valid,setValid]=useState(true),[data,setData]=useState<Payload|null>(null),[error,setError]=useState(''),[refreshKey,setRefreshKey]=useState(0);
 const generation=useRef(0);
 const loadedKey=useRef('');
 useEffect(()=>{setValid(true);const unsubscribe=subscribeAccountInvalidation(next=>{if(next!==actorId){generation.current++;setValid(false);setData(null);setError('');}});return()=>{generation.current++;unsubscribe();};},[actorId]);
 useEffect(()=>{const own=++generation.current,key=view+':'+(id??'');if(loadedKey.current!==key)setData(null);setError('');if(!actorId||!enabled)return;const query=new URLSearchParams({view});if(id)query.set('id',id);
  void fetch('/api/ops/dashboard?'+query,{cache:'no-store'}).then(async response=>{const body=await response.json();if(own!==generation.current)return;if(!response.ok||!body.ok)throw Error(body.code??'UNAVAILABLE');loadedKey.current=key;setData(body.data);}).catch((next:unknown)=>{if(own===generation.current)setError(next instanceof Error?next.message:'UNAVAILABLE');});
  return()=>{generation.current++;};
 },[actorId,enabled,view,id,refreshKey]);
 const label=views.find(item=>item[0]===view),title=label?(locale==='en'?label[1]:label[2]):t('Operations record','營運紀錄');
 if(!enabled)return <section className="k-page"><h1>{title}</h1><p role="status">{t('Operations services are not connected yet.','營運服務尚未接通。')}</p></section>;
 if(!actorId||!valid)return <section className="k-page"><h1>{title}</h1><Link href={`/${locale}/sign-in?next=${encodeURIComponent('/'+locale+'/ops?view='+view)}`}>{t('Sign in to continue','登入後繼續')}</Link></section>;
 return <section className="k-page"><div className="k-page-heading"><div><p className="k-eyebrow">{t('KINNSO OPERATIONS','KINNSO 營運')}</p><h1>{title}</h1></div><Link className="k-btn" href={href('ops')}>{t('Review queue','審核待辦')}</Link></div>
  <nav className="k-nav-chips" aria-label={t('Operations sections','營運功能')}>{views.map(([key,en,zh])=><Link key={key} className={key===view?'active':''} href={href('ops?view='+key)}>{locale==='en'?en:zh}</Link>)}</nav>
  {error&&<p role="alert">{t('Operations record could not be loaded: ','未能載入營運紀錄：')}{error}</p>}{!data&&!error&&<p role="status">{t('Loading operations records…','正在載入營運紀錄…')}</p>}
  {data?.items&&actorId&&contentAdminViews.has(view)&&<OpsContentAdmin actorId={actorId} view={view as 'sessions'|'perks'|'testimonials'|'enquiries'} items={data.items} onChanged={()=>setRefreshKey(value=>value+1)}/>}
  {data?.status==='GATED'&&<div className="k-card" role="status"><h2>{t('This capability remains gated','此功能仍暫停啟用')}</h2><p>{data.reason==='PROVIDER_OR_FINANCIAL_ACTION_GATED'?t('Booking, payment and payout execution is outside this release. No zero totals are being shown.','訂位、付款及提款執行不在此版本內；此處不會以零值代替未讀取資料。'):t('The service is unavailable in this release.','此服務未在此版本啟用。')}</p></div>}
  {data?.counts&&<div className="k-card"><h2>{t('Operational counts','營運數量')}</h2><dl>{Object.entries(data.counts).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{value}</dd></div>)}</dl></div>}
  {data?.items&&!contentAdminViews.has(view)&&<div className="k-card-list">{data.items.length===0?<p>{t('No records returned.','未返回紀錄。')}</p>:data.items.map((item,index)=><article className="k-card" key={String(item.id??index)}><h2>{String(item.title??item.company_name??item.display_name??item.quote??item.id??t('Record','紀錄'))}</h2><dl>{Object.entries(item).filter(([key,value])=>key!=='id'&&scalar(value)).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{String(value)}</dd></div>)}</dl>{Boolean(item.id)&&['creators','merchants','missions'].includes(view)&&<Link className="k-btn" href={href('ops?view='+view+'&id='+encodeURIComponent(String(item.id)))}>{t('Open record','開啟紀錄')}</Link>}</article>)}</div>}
  {data?.detail!==undefined&&<div className="k-card"><h2>{t('Record detail','紀錄詳情')}</h2>{data.detail===null?<p>{t('The requested record was not found.','找不到要求的紀錄。')}</p>:<><pre className="k-safe-json">{JSON.stringify(data.detail,null,2)}</pre>{actorId&&['creators','merchants'].includes(view)&&<OpsRecordActions actorId={actorId} view={view as 'creators'|'merchants'} detail={data.detail}/>}</>}</div>}
 </section>;
}
