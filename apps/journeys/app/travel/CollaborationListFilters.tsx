'use client';
import {collaborationStates,type CollaborationListQuery,type CollaborationListScope} from '../../lib/collaboration/list-query';
export function CollaborationListFilters({locale,scope,value,disabled,onChange,onSearch,onClear}:{locale:string;scope:CollaborationListScope;value:CollaborationListQuery;disabled:boolean;onChange:(query:CollaborationListQuery)=>void;onSearch:()=>void;onClear:()=>void}){
 const t=(en:string,zh:string)=>locale==='en'?en:zh;
 const labels:Record<string,[string,string]>={draft:['Draft','草稿'],published:['Open','開放中'],paused:['Closed to new applications','已停止接受新申請'],completed:['Completed','已完成'],cancelled:['Withdrawn or cancelled','已撤回或取消'],invited:['Invitation received','收到邀請'],applied:['Application under review','申請審核中'],active:['Active collaboration','合作進行中'],rejected:['Rejected','未獲接納'],submitted:['Submitted for review','已提交審核'],revision_requested:['Revision requested','需要修改']};
 const search=t(scope==='merchant'?'Search promotions':'Search collaborations',scope==='merchant'?'搜尋推廣':'搜尋合作');
 return <fieldset disabled={disabled} className="k-actions"><legend>{t('List filters','清單篩選')}</legend>
  <label>{search}<input type="search" maxLength={100} value={value.q??''} onChange={e=>onChange({...value,q:e.target.value})}/></label>
  <label>{t('List status','清單狀態')}<select aria-label={t('List status','清單狀態')} value={value.status??''} onChange={e=>onChange({...value,status:e.target.value||undefined})}><option value="">{t('All supported statuses','所有支援狀態')}</option>{collaborationStates[scope].map(state=><option key={state} value={state}>{t(...labels[state])}</option>)}</select></label>
  <label>{t('List order','清單排序')}<select aria-label={t('List order','清單排序')} value={value.sort??'recent'} onChange={e=>onChange({...value,sort:e.target.value as 'recent'|'deadline'})}><option value="recent">{t('Newest created first','最新建立優先')}</option><option value="deadline">{t('Next unfinished deadline','下一個待完成期限')}</option></select></label>
  <button className="k-btn" type="button" onClick={onSearch}>{search}</button><button className="k-btn" type="button" onClick={onClear}>{t('Clear filters','清除篩選')}</button>
 </fieldset>;
}
