'use client';
import {useEffect,useRef,useState} from 'react';
import {assessItinerary} from '../../lib/trips/feasibility';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import type {TripSnapshot,TripCommand} from '../../lib/contracts/trips';
import type {PlaceFact} from '../../lib/places/contracts';
import {useApp} from './ui';
import {WarningReason} from './WarningReason';

const labels:Record<string,[string,string]>={UNDATED:['Choose dates to check opening hours and time changes.','選擇日期後才可核對營業時間及時差。'],UNKNOWN_TRAVEL:['Travel time between stops is unknown.','站點之間的移動時間未核實。'],UNVERIFIED_HOURS:['Opening hours are unverified.','營業時間未核實。'],PLACE_STALE:['Place information needs a fresh check.','地點資料需要重新核實。'],MISSING_TIME:['No arrival time is set.','尚未設定到訪時間。'],OVERLAP:['This stop overlaps the previous stop.','此站與上一站的時間重疊。'],CROSS_DAY:['This stop extends into the next day.','此站會延至下一天。'],DST_GAP:['This local time does not exist because clocks move forward.','因夏令時間前移，此本地時間不存在。'],DST_FOLD:['This local time occurs twice. Choose the intended occurrence.','此本地時間會出現兩次，請確認所指時間。'],OUTSIDE_HOURS:['Arrival is outside the verified opening hours.','到訪時間不在已核實營業時段內。'],TIMEZONE_MISMATCH:['Place and trip time zones differ; review the local arrival time.','地點與行程時區不同，請核對當地到訪時間。']};
type FactView={facts:PlaceFact[];read:'loading'|'ready'|'read-error';loaded:boolean};
type FactScope={tripId:string;active:boolean;invalidated:boolean;lifetime:number;version:number;view:FactView};
function newScope(tripId:string):FactScope{return{tripId,active:false,invalidated:false,lifetime:0,version:0,view:{facts:[],read:'loading',loaded:false}};}
// Only public HTTP(S) sources are actionable. Rejected URLs never become hrefs.
function sourceLink(raw:string|null):string|null {
 if(!raw||/[\u0000-\u0020\u007f]/.test(raw))return null;
 try{
  const url=new URL(raw),host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!host.includes('.')||
   host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||
   /^[\d.]+$/.test(host)||host.includes(':'))return null;
  return url.href;
 }catch{return null;}
}
export function TripWarnings({trip,save}:{trip:TripSnapshot;save:(command:TripCommand)=>Promise<boolean>}){
 const {t}=useApp(),live=useRef<FactScope>(newScope(trip.id));
 if(live.current.tripId!==trip.id){live.current.active=false;live.current=newScope(trip.id);}
 const scope=live.current,[rendered,setRendered]=useState({scope,value:scope.view});
 const view=rendered.scope===scope?rendered.value:scope.view;
 const lifetime=scope.lifetime;
 const owns=(generation=scope.lifetime)=>live.current===scope&&scope.active&&!scope.invalidated&&scope.lifetime===generation;
 function show(patch:Partial<FactView>){if(owns()){scope.view={...scope.view,...patch};setRendered({scope,value:scope.view});}}
 async function refresh(){
  if(!owns())return;
  const version=++scope.version;show({read:'loading'});
  try{
   const response=await fetch('/api/trips/'+encodeURIComponent(scope.tripId)+'/facts',{cache:'no-store'});
   const result=await response.json();
   if(!owns()||version!==scope.version)return;
   if(!response.ok||!result.ok||!Array.isArray(result.data)){show({read:'read-error'});return;}
   show({facts:result.data,read:'ready',loaded:true});
  }catch{if(owns()&&version===scope.version)show({read:'read-error'});}
 }
 useEffect(()=>{
  scope.active=true;scope.lifetime++;
  const unsubscribe=subscribeAccountInvalidation(()=>{
   if(!owns())return;
   scope.invalidated=true;scope.version++;scope.view={facts:[],read:'read-error',loaded:false};setRendered({scope,value:scope.view});
  });
  return()=>{scope.active=false;scope.version++;unsubscribe();};
 },[scope]);
 useEffect(()=>{void refresh();return()=>{scope.version++;};},[scope,trip.revision]);
 if(scope.invalidated)return <p role="status">{t('Account changed. Reload your authorized trip before reading facts.','帳戶已改變，請重新載入獲授權行程後再讀取資料。')}</p>;
 const stops=trip.days.flatMap(day=>day.stops),relevant=new Set(stops.map(stop=>stop.placeId).filter(Boolean));
 const facts=view.facts.filter(fact=>relevant.has(fact.placeId)),warnings=assessItinerary(trip,facts);
 // A reason records private planning intent. It never verifies a source or date.
 const saveReason=(command:TripCommand)=>owns(lifetime)?save(command):Promise.resolve(false);
 return <aside className="os-guide os-stop">
  <h2>{t('Trip checks','行程提醒')}</h2>
  <p>{t('These are planning reminders. Transport estimates are unavailable.','這些是規劃提醒，暫未提供交通時間估算。')}</p>
  <p>{t('Private planning reasons do not verify place facts; they remain private.','私人規劃理由不會核實地點資料，並會保持私人。')}</p>
  <p role="status">{view.read==='loading'?t('Loading recorded place facts…','正在載入已記錄的地點資料…'):view.read==='read-error'?(view.loaded?t('Could not refresh place facts. The latest facts are unknown.','未能重新整理地點資料，最新資料狀態未知。'):t('Could not load place facts. Their state is unknown.','未能載入地點資料，目前狀態未知。')):facts.length===0?t('No loaded place facts were returned. Verification is unknown.','沒有已載入的地點資料，核實狀態未知。'):t('Recorded place facts loaded. See each recorded source and verification date below.','已載入已記錄的地點資料。請參閱下方各項已記錄來源及核實日期。')}</p>
  {view.loaded&&view.read!=='ready'&&<p role="status">{t('Previously loaded facts are retained and may be stale. They do not confirm a successful refresh.','先前載入的資料已保留，可能過期，並不代表重新整理成功。')}</p>}
  <button className="k-btn" disabled={view.read==='loading'} onClick={refresh}>{t('Refresh loaded facts','重新整理已載入資料')}</button>
  <ul>{warnings.map((warning,index)=><li key={warning.code+':'+warning.stopId+':'+index}>
   {warning.stopId?stops.find(stop=>stop.id===warning.stopId)?.title+': ':''}
   {t(...(labels[warning.code]??['Review this stop.','請核對此站。']))}
   {warning.stopId&&<WarningReason key={trip.id+':'+warning.stopId+':'+warning.code} trip={trip} stopId={warning.stopId} code={warning.code} save={saveReason}/>}
  </li>)}</ul>
  <h3>{t('Loaded place fact sources','已載入的地點資料來源')}</h3>
  <ul>{facts.map(fact=>{
   const url=sourceLink(fact.sourceUrl),knownDate=typeof fact.verifiedAt==='string'&&Number.isFinite(Date.parse(fact.verifiedAt));
   return <li key={fact.placeId}>
    <strong>{stops.filter(stop=>stop.placeId===fact.placeId).map(stop=>stop.title).join(' / ')}</strong>
    <p>{t('Recorded verification date','已記錄核實日期')}: {knownDate?<time dateTime={fact.verifiedAt!}>{fact.verifiedAt}</time>:t('Unknown','未知')}</p>
    <p>{t('Recorded source','已記錄來源')}: {url?<a href={url} target="_blank" rel="noopener noreferrer">{url}</a>:fact.sourceUrl?t('Source unavailable: unsafe or invalid link.','來源無法使用：連結不安全或無效。'):t('Unknown','未知')}</p>
   </li>;
  })}</ul>
 </aside>;
}
