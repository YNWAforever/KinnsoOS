"use client";
import {useEffect,useRef,useState,type ComponentType} from 'react';
import {useApp} from './ui';

/** A chunk outage stays within its tool; healthy siblings and receipts stay mounted. */
export async function loadMerchantTool<P extends object>(load:()=>Promise<ComponentType<P>>):Promise<ComponentType<P>>{
 try{return await load();}catch{
  return function MerchantToolRecovery(props:P){
   const{t}=useApp();const[component,setComponent]=useState<ComponentType<P>|null>(null),[busy,setBusy]=useState(false);
   const generation=useRef(0),running=useRef(false);
   useEffect(()=>()=>{++generation.current;},[]);
   async function retry(){
    if(running.current)return;running.current=true;setBusy(true);const own=++generation.current;
    try{const loaded=await load();if(own===generation.current)setComponent(()=>loaded);}
    catch{/* Expected asset failure: retain the actionable local recovery shell. */}
    finally{if(own===generation.current){running.current=false;setBusy(false);}}
   }
   if(component){const Tool=component;return <Tool {...props}/>;}
   return <section className="k-card">
    <p role={busy?'status':'alert'}>{busy?t('Loading company tools…','正在載入公司工具…'):t('This company tool could not load. Check your connection and retry; your other tools stay open.','未能載入此公司工具。請檢查連線後重試；其他工具會保持開啟。')}</p>
    <button className="k-btn" type="button" disabled={busy} onClick={()=>void retry()}>{t('Retry loading company tool','重試載入公司工具')}</button>
   </section>;
  };
 }
}
