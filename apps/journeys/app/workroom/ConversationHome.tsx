'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useApp} from '../travel/ui';
import {suggestTemplates,templateById} from '../../lib/studio/templates';
import {stageGuestQuestion} from '../../lib/studio/guest-draft';
import type {TemplateId} from '../../lib/studio/contracts';
import './workroom.css';
import './discovery.css';
export function ConversationHome({discoveryEnabled=false}:{discoveryEnabled?:boolean}={}){
 const {t,href}=useApp(),router=useRouter(),[question,setQuestion]=useState(''),[choices,setChoices]=useState<TemplateId[]>([]);
 function start(id:TemplateId){stageGuestQuestion(question);router.push(href('workroom')+'?template='+id);}
 const audiences=[{role:'traveller',label:t('Traveller','旅人'),icon:'↗',copy:t('Make the journey yours.','走出自己的旅程。'),items:[['T1','探索目的地'],['T1','規劃行程'],['T4','整理收藏'],['T3','分享行程']]},{role:'creator',label:t('Creator','創作者'),icon:'✎',copy:t('Turn a place into a story.','把熟悉的地方寫成故事。'),items:[['C1','寫 guide'],['C2','發佈前檢查'],['C3','成效檢討']]},{role:'merchant',label:t('Merchant','商戶'),icon:'⌂',copy:t('Help travellers discover your place.','讓旅客認識你的小店。'),items:[['M1','更新資料'],['M2','處理查詢'],['M3','活動素材']]}];
 return <section className="cs-home" aria-labelledby="conversation-heading">
  <p className="cs-eyebrow">{t('Explore, plan and record your journey','探索、規劃及記錄旅程')}</p>
  <h1 id="conversation-heading">{t('Your next journey starts with a question.','下一段旅程，從一個問題開始。')}</h1>
  <p className="cs-intro">{t('A place to go, a story to tell, a little shop to share. Start here.','想去的地方、想寫的故事、想分享的小店，都可以從這裏開始。')}</p>
  <form className="cs-question" onSubmit={event=>{event.preventDefault();const result=suggestTemplates(question);if(result.needsClarification)setChoices(result.ids);else start(result.ids[0]);}}>
   <label htmlFor="studio-question">{t('What would you like to work on?','想去哪裏、寫甚麼，或讓旅客找到你的店？')}</label>
   <textarea id="studio-question" maxLength={8000} rows={3} value={question} onChange={event=>{setQuestion(event.target.value);setChoices([]);}} placeholder={t('Help me turn my own notes into a guide brief…','幫我把自己的散步筆記，整理成一份 guide brief…')}/>
   <div className="cs-question-actions"><div><Link href={href('workroom/documents')}>{t('Choose documents','選擇文件')}</Link><Link href={href('workroom/templates')}>{t('Task templates','任務範本')}</Link></div><button className="k-btn primary" type="submit">{t('Start a conversation','開始聊聊')} <span aria-hidden="true">↗</span></button></div>
  </form>
  {!!choices.length&&<div className="cs-clarify" role="status"><p>{t('Which task would you like to start with?','想先完成哪一件事？')}</p>{choices.map(id=><button className="k-btn" key={id} onClick={()=>start(id)}>{t(templateById(id).en,templateById(id).title)}</button>)}</div>}
  <p className="cs-note">{t('Try with your own text. Sign in to save. Connected accounts are optional.','可先用自己的文字試問；保存需登入。沒有連接帳號也能開始。')}</p>
  {discoveryEnabled&&<article className="ds-home-card"><div><span className="cs-chip">新的旅程靈感 · 示例</span><h2>我的下一趟旅程</h2><p>告訴我們想去的城市，找合適的小店、優惠和創作靈感。</p></div><div><Link className="k-btn primary" href={href('workroom/discovery')}>開始旅程與優惠配對</Link><Link href={href('merchant/offer-discovery')}>商戶優惠展示</Link></div></article>}
  <div className="cs-audiences">{audiences.map(group=><article data-audience={group.role} key={group.role}><span className="cs-role-icon" aria-hidden="true">{group.icon}</span><h2>{group.label}</h2><p>{group.copy}</p><div>{group.items.map(([id,label])=><button key={label} onClick={()=>start(id as TemplateId)}>{t(templateById(id).en,label)} <span aria-hidden="true">↗</span></button>)}</div></article>)}</div>
 </section>;
}
