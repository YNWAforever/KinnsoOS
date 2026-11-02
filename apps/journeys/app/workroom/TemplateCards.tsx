'use client';
import {useApp} from '../travel/ui';
import {templates} from '../../lib/studio/templates';
import type {TemplateId} from '../../lib/studio/contracts';
export function TemplateCards({onSelect,ops=false}:{onSelect:(id:TemplateId)=>void;ops?:boolean}){
 const {t}=useApp();
 return <section aria-label={t('Task templates','任務範本')}><h2>{t('Choose a small next step','選一個想完成的小任務')}</h2><div className="cs-template-grid">{templates.filter(x=>ops||x.role!=='ops').map(task=><article className="cs-card" key={task.id}><span className="cs-chip">{task.id} · {task.difficulty} · {task.minutes}</span><h3>{t(task.en,task.title)}</h3><dl><dt>輸入文件</dt><dd>{task.inputs}</dd><dt>所需權限</dt><dd>{task.permission}</dd><dt>成果及存回</dt><dd>{task.output} · {task.destination}</dd></dl><button className="k-btn" onClick={()=>onSelect(task.id)}>{t('Use this template','使用這個範本')}</button></article>)}</div></section>;
}
