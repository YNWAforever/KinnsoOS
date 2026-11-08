'use client';
import {useApp} from '../travel/ui';
import Link from 'next/link';
import {templates} from '../../lib/studio/templates';
import type {TemplateId} from '../../lib/studio/contracts';
export function TemplateCards({onSelect,ops=false,audience}:{onSelect:(id:TemplateId)=>void;ops?:boolean;audience?:string}){
 const {t,href}=useApp();
 const filters=[['','All tasks','所有任務'],['traveller','Traveller','旅人'],['creator','Creator','創作者'],['merchant','Merchant','商戶'],...(ops?[['ops','Operations','營運']]:[])];
 const selected=filters.some(([role])=>role===audience)?audience:'';
 return <section aria-label={t('Task templates','任務範本')}><h1>{t('Choose a small next step','選一個想完成的小任務')}</h1>
  <nav className="cs-template-filters" aria-label={t('Filter tasks','篩選任務')}>{filters.map(([role,en,zh])=><Link key={role} href={href('workroom/templates')+(role?'?audience='+role:'')} aria-current={selected===role?'page':undefined}>{t(en,zh)}</Link>)}</nav>
  <div className="cs-template-grid">{templates.filter(x=>(ops||x.role!=='ops')&&(!selected||x.role===selected)).map(task=><article className="cs-card" key={task.id}><span className="cs-chip">{task.id} · {task.difficulty} · {task.minutes}</span><h2>{t(task.en,task.title)}</h2><dl><dt>{t('Documents','輸入文件')}</dt><dd>{task.inputs}</dd><dt>{t('Permissions','所需權限')}</dt><dd>{task.permission}</dd><dt>{t('Outcome','成果')}</dt><dd>{task.output}</dd></dl><button className="k-btn" onClick={()=>onSelect(task.id)}>{t('Use this template','使用這個範本')}</button></article>)}</div></section>;
}
