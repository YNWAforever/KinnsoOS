'use client'
import { useRef,useState,useSyncExternalStore } from 'react'
import { publishStructuredGuide,withdrawStructuredGuide } from '@/lib/guides/versions'
export type StructuredContent={days:{offset:number;title:string;stops:{title:string;description:string;placeId:string|null;startMinuteOfDay:number|null;durationMinutes:number|null}[]}[]}
const subscribe=()=>()=>{}
export function StructuredGuideForm({id,locale,initialVersion=0,initialContent=null}:{id:string;locale:string;initialVersion?:number;initialContent?:StructuredContent|null}) {
 const [days,setDays]=useState<StructuredContent['days']>(()=>initialContent?initialContent.days.map(day=>({offset:day.offset,title:day.title,stops:day.stops.map(stop=>({title:stop.title,description:stop.description,placeId:stop.placeId,startMinuteOfDay:stop.startMinuteOfDay,durationMinutes:stop.durationMinutes}))})):[{offset:0,title:'',stops:[{title:'',description:'',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}])
 const [version,setVersion]=useState(initialVersion),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const intent=useRef<{key:string;requestId:string}|null>(null)
 const ready=useSyncExternalStore(subscribe,()=>true,()=>false)
 const zh=locale==='zh-hk'
 async function publish() {
  if(busy||!ready)return;setBusy(true)
  const content={days},key=JSON.stringify(content)
  if(intent.current?.key!==key)intent.current={key,requestId:crypto.randomUUID()}
  try {
   const result=await publishStructuredGuide(id,version,intent.current.requestId,content,locale)
   if(result.ok){setVersion((result.data as {version:number}).version);intent.current=null;setMessage(zh?'版本已發布。既有旅人行程不會自動覆蓋。':'Version published. Existing traveller copies stay unchanged.')}
   else setMessage(result.code==='CONFLICT'?(zh?'版本已有變更，請重新核對。':'Version changed; review the current version.'):(zh?'未能發布，輸入已保留。':'Publication failed; input is kept.'))
  } catch {setMessage(zh?'未確認發布，輸入已保留，請重試。':'Publication was not confirmed; input is kept. Retry the same action.')}
  finally {setBusy(false)}
 }
 async function withdraw(){if(busy||!ready)return;setBusy(true);try{const result=await withdrawStructuredGuide(id,locale);setMessage(result.ok?(zh?'已撤回新套用，私人筆記保留。':'New adoptions withdrawn; private notes retained.'):(zh?'撤回失敗。':'Withdrawal failed.'))}catch{setMessage(zh?'未確認撤回，請重試。':'Withdrawal was not confirmed. Please retry.')}finally{setBusy(false)}}
 return <section data-testid="structured-editor" data-ready={ready}><h2>{zh?'結構化行程版本':'Structured itinerary version'}</h2>
 <p>{zh?'摘要不會變成站點。請輸入你有權公開的行程內容。':'Summary text is never converted into stops. Enter itinerary content you have rights to publish.'}</p>
 {days.map((day,index)=><fieldset key={index}><legend>{zh?'第':'Day '}{index+1}{zh?'日':''}</legend>
 <label>{zh?'日期名稱':'Day title'}<input disabled={!ready} value={day.title} maxLength={200} onChange={e=>setDays(current=>current.map((d,i)=>i===index?{...d,title:e.target.value}:d))}/></label>
 {day.stops.map((stop,position)=><div key={position}><label>{zh?'站點名稱':'Stop title'}<input disabled={!ready} required maxLength={200} value={stop.title} onChange={e=>setDays(current=>current.map((d,i)=>i===index?{...d,stops:d.stops.map((s,j)=>j===position?{...s,title:e.target.value}:s)}:d))}/></label>
 <label>{zh?'公開描述':'Public description'}<textarea disabled={!ready} maxLength={4000} value={stop.description} onChange={e=>setDays(current=>current.map((d,i)=>i===index?{...d,stops:d.stops.map((s,j)=>j===position?{...s,description:e.target.value}:s)}:d))}/></label></div>)}
 <button type="button" disabled={day.stops.length>=50} onClick={()=>setDays(current=>current.map((d,i)=>i===index?{...d,stops:[...d.stops,{title:'',description:'',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}:d))}>{zh?'加入站點':'Add stop'}</button></fieldset>)}
 <button type="button" disabled={days.length>=30} onClick={()=>setDays(current=>[...current,{offset:current.length,title:'',stops:[{title:'',description:'',placeId:null,startMinuteOfDay:null,durationMinutes:null}]}])}>{zh?'加入一天':'Add day'}</button>
 <button type="button" disabled={busy||!ready} onClick={publish}>{zh?'發布結構化版本':'Publish structured version'}</button>
 <button type="button" disabled={busy||!ready} onClick={withdraw}>{zh?'撤回套用':'Withdraw adoption'}</button>
 <p role="status">{message}</p></section>
}
