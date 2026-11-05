import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {currentActor} from '../../../../lib/auth/actor';
import {serverClient} from '../../../../lib/supabase/server';
import {capabilities} from '../../../../lib/contracts/capabilities';
import {readCreatorInsights,type InsightsClient} from '../../../../lib/creators/insights';

export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Insights({params}:{params:Promise<{locale:string}>}){
 const{locale}=await params;
 if(!['en','zh-HK'].includes(locale)||capabilities(process.env).creator.mode!=='connected')notFound();
 const en=locale==='en',t=(english:string,chinese:string)=>en?english:chinese;
 const actor=await currentActor();
 if(!actor)redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/studio/insights`)}`);
 let data;try{data=await readCreatorInsights(await serverClient() as unknown as InsightsClient|null,actor.id);}catch{
  return <main className="k-page"><h1>{t('Creator insights','創作成效')}</h1><p role="status">{t('Insights are unavailable. Check your creator access and try again.','暫時無法載入成效。請確認創作者權限後重試。')}</p><Link href={`/${locale}/studio`}>{t('Creator Studio','創作工作室')}</Link></main>;
 }
 const metrics=[[t('Contribution points','貢獻積分'),data.pointsTotal],[t('Published guides','已發布攻略'),data.guidesPublished],[t('Guide saves','攻略收藏次數'),data.guideSavesTotal],[t('Approved submissions','已核准提交'),data.submissionsApproved],[t('Visits driven','帶動到訪次數'),data.visitsDriven]];
 return <main className="k-page"><Link href={`/${locale}/studio`}>{t('Creator Studio','創作工作室')}</Link><h1>{t('Creator insights','創作成效')}</h1>
  <dl>{metrics.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  <h2>{t('Contribution tier','貢獻等級')}</h2><p>{data.tier.tier}</p><p>{data.tier.nextTier?t(`${data.tier.pointsForNext} points to ${data.tier.nextTier}`,`距離 ${data.tier.nextTier} 尚需 ${data.tier.pointsForNext} 積分`):t('Highest tier reached','已達最高等級')}</p>
  <h2>{t('Weekly cumulative points','每週累計積分')}</h2>{data.trajectory.length?<table><thead><tr><th scope="col">{t('Week','週')}</th><th scope="col">{t('Points','積分')}</th></tr></thead><tbody>{data.trajectory.map(row=><tr key={row.weekStart}><th scope="row">{row.weekStart}</th><td>{row.cumulative}</td></tr>)}</tbody></table>:<p>{t('No contribution activity in this period.','此期間尚未有貢獻紀錄。')}</p>}
  <h2>{t('Points by activity','各項活動積分')}</h2><dl>{[[t('Published guides','發布攻略'),data.pointsByType.guide_published],[t('Verified collaborations','已驗證合作'),data.pointsByType.mission_verified],[t('Profile scan','個人檔案分析'),data.pointsByType.dna_scan]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  <h2>{t('Collaborations','合作')}</h2><dl>{[[t('Applied','已申請'),data.missionsByStatus.applied],[t('Active','進行中'),data.missionsByStatus.active],[t('Invited','已邀請'),data.missionsByStatus.invited],[t('Rejected','已拒絕'),data.missionsByStatus.rejected]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
 </main>;
}
