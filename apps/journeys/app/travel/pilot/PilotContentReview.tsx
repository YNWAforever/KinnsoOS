import { useApp } from '../ui';
import { formStyle, inputStyle, submitData, uuidPattern, type PilotSectionProps } from './PilotRun';

export function PilotContentReview({ snapshot, canWrite, confirm }: PilotSectionProps) {
  const { t } = useApp();
  return <section className="k-card">
    <h2>{t('Content intake review','內容提交審核')}</h2>
    {!snapshot.contentIntakes.length && <p>{t('Content intake records are missing.','缺少內容提交紀錄。')}</p>}
    {snapshot.contentIntakes.map(intake => <article key={intake.id} className="k-card">
      <h3>{t('Intake record','提交紀錄')} <code>{intake.id}</code></h3>
      <p>{intake.status} · {intake.authoredLocale}</p>
      <p>{t('Guide record','指南紀錄')}：{intake.guideId ?? t('Missing guide binding','缺少指南連結')}</p>
      <p>{t('Approved draft revision','已批准草稿版本')}：{intake.guideDraftRevision ?? t('Not recorded','未記錄')}</p>
      <p>{t('Approved content digest','已批准內容摘要碼')}：{intake.contentDigest ?? t('Not recorded','未記錄')}</p>
      {canWrite && !['published','withdrawn'].includes(intake.status) && <form style={formStyle} onSubmit={event => {
        const { value, opener } = submitData(event);
        confirm({type:'bindGuide', intakeId:intake.id, expectedRevision:intake.revision, guideId:value('guide')},
          t('Bind guide record','連結指南紀錄'), opener);
      }}>
        <label>{t('Existing guide ID','現有指南 ID')}<input style={inputStyle} name="guide" pattern={uuidPattern} required/></label>
        <button className="k-btn">{t('Bind guide record','連結指南紀錄')}</button>
      </form>}
      {canWrite && ['submitted','rejected','approved','published'].includes(intake.status) && <>
        <p role="status">{t('Approval is blocked until the service can verify the exact reviewed draft revision and digest with a written reason.', '服務必須核實已審核的確切草稿版本、摘要碼及書面原因，才可批准。')}</p>
        <form style={formStyle} onSubmit={event => {
          const { value, opener } = submitData(event);
          confirm({type:'reviewContentIntake', id:intake.id, expectedRevision:intake.revision, decision:'reject', reason:value('reason')},
            t('Reject intake','拒絕內容提交'), opener);
        }}>
          <label>{t('Written review reason','書面審核原因')}<textarea style={inputStyle} name="reason" required maxLength={1000}/></label>
          <button className="k-btn">{t('Reject intake','拒絕內容提交')}</button>
        </form>
      </>}
    </article>)}
  </section>;
}
