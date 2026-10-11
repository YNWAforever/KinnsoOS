'use client';
import {actionGroup,type NextAction,type ActionKind} from '../../lib/collaboration/tasks';

export function CollaborationTasks({actions,locale,disabled=false}:{actions:NextAction[];locale:string;disabled?:boolean}){
 const t=(en:string,zh:string)=>locale==='zh-HK'?zh:en;
 const labels:Record<ActionKind,[string,string]>={
  'respond-invite':['Respond to invitation','回覆邀請'],continue:['Continue collaboration','繼續合作'],deliver:['Prepare your work','準備作品'],revise:['Revise your work','修改作品'],'await-review':['Awaiting review','等候審核'],completed:['Reviewed work','已完成工作'],
  'draft-campaign':['Complete campaign draft','完成活動草稿'],'review-application':['Review application','審核申請'],'review-delivery':['Review submitted work','審核已提交作品'],'setup-merchant':['Complete merchant application','完成商戶申請'],'await-merchant-review':['Awaiting merchant approval','等候商戶審批'],'revise-merchant-application':['Review feedback and apply again','查看回饋並再次申請'],'open-company':['Open your company','開啟公司工作區'],
 };
 return <section className="k-card k-collaboration-tasks" aria-label={t('Collaboration next actions','合作下一步')}>
  <h2>{t('Your next actions','你的下一步')}</h2>
  <p className="k-muted">{t('This overview shows the loaded records. Open a list to see more.','總覽顯示目前已載入的紀錄，請開啟清單查看其他工作。')}</p>
  {(['mine','waiting','completed'] as const).map(group=>{
   const items=actions.filter(action=>actionGroup(action)===group);
   return <section key={group}><h3>{group==='mine'?t('To do','待我處理'):group==='waiting'?t('Waiting for others','等候對方'):t('Completed','已完成')}</h3>
    {!items.length?<p>{t('No tasks on this page.','本頁沒有此類工作。')}</p>:<ul>{items.map(action=><li key={action.kind+':'+action.entityId}>
     <a className="k-btn" href={disabled?undefined:action.href} aria-disabled={disabled||undefined}>{t(...labels[action.kind])}{action.title?' · '+action.title:''}</a>
     {action.dueAt&&<p>{t('Due (UTC)','到期（UTC）')} · <time dateTime={action.dueAt}>{new Date(action.dueAt).toLocaleString(locale==='zh-HK'?'zh-HK':'en-GB',{timeZone:'UTC'})}</time></p>}
    </li>)}</ul>}
   </section>;
  })}
 </section>;
}
