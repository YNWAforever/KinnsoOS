'use client';
import {useState} from 'react';
import type {TripIntentInput,DateSpec} from '../../lib/discovery/contracts';
import {validateTripIntent} from '../../lib/discovery/intents';
import {priceMinor} from '../../lib/discovery/matching';
export function TripIntentForm({value,disabled=false,onSave}:{value?:TripIntentInput;disabled?:boolean;onSave:(value:TripIntentInput)=>void}){
 const [city,setCity]=useState(value?.cityKey??'city:hk:hong-kong'),[kind,setKind]=useState<DateSpec['kind']>(value?.dateSpec.kind??'fixed');
 const [start,setStart]=useState(value?.dateSpec.kind==='fixed'?value.dateSpec.start:value?.dateSpec.kind==='window'?value.dateSpec.earliest:'2026-11-07'),[end,setEnd]=useState(value?.dateSpec.kind==='fixed'?value.dateSpec.end:value?.dateSpec.kind==='window'?value.dateSpec.latest:'2026-11-09');
 const [budget,setBudget]=useState(value?.budget?String(value.budget.maxPerPersonMinor/100):'200'),[currency,setCurrency]=useState<'HKD'|'TWD'>(value?.budget?.currency??'HKD'),[tags,setTags]=useState(value?.interestTags??['散步']),[error,setError]=useState('');
 function submit(){try{const input=validateTripIntent({cityKey:city,dateSpec:kind==='fixed'?{kind,start,end}:kind==='window'?{kind,earliest:start,latest:end}:{kind},budget:budget.trim()?{currency,maxPerPersonMinor:priceMinor(budget.trim())!}:null,interestTags:tags,languages:['zh-HK']});setError('');onSave(input);}catch(e){setError(e instanceof Error&&e.message==='UNSUPPORTED'?'這個城市尚未支援配對，你仍可使用原有行程範本。':'請核對日期先後、90 日範圍及預算金額。');}}
 return <form className="ds-form" aria-label="私人旅程意向" onSubmit={e=>{e.preventDefault();submit();}}><fieldset disabled={disabled}>
 <label>目的地<select aria-label="目的地" value={city} onChange={e=>setCity(e.target.value)}><option value="city:hk:hong-kong">香港 · 示例城市</option><option value="unsupported">其他城市（配對尚未支援）</option></select></label>
 <label>日期安排<select aria-label="日期安排" value={kind} onChange={e=>setKind(e.target.value as DateSpec['kind'])}><option value="fixed">已選日期</option><option value="window">彈性日期範圍</option><option value="undecided">日期尚未決定</option></select></label>
 {kind!=='undecided'&&<div className="ds-two"><label>出發日期<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>結束日期<input type="date" value={end} onChange={e=>setEnd(e.target.value)} required/></label></div>}
 <div className="ds-two"><label>每人預算（可留空）<input inputMode="decimal" value={budget} onChange={e=>setBudget(e.target.value)} maxLength={10}/></label><label>幣別<select aria-label="幣別" value={currency} onChange={e=>setCurrency(e.target.value as 'HKD'|'TWD')}><option>HKD</option><option>TWD</option></select></label></div>
 <div className="ds-checks"><span>這趟想體驗甚麼？</span>{['散步','文化','美食'].map(tag=><label key={tag}><input type="checkbox" checked={tags.includes(tag)} onChange={e=>setTags(e.target.checked?[...tags,tag]:tags.filter(t=>t!==tag))}/>{tag}</label>)}</div>
 <p className="cs-note">意向只屬於你，不會交給商戶或 SMEAssistant。保存不代表預訂；無需連接個人帳號。</p>
 <button className="k-btn primary" type="submit">保存私人意向</button></fieldset>{error&&<p role="alert">{error}</p>}</form>;
}
