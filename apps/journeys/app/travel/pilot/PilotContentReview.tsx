import { useApp } from '../ui';
import { formStyle, inputStyle, submitData, uuidPattern, type PilotSectionProps } from './PilotRun';

export function PilotContentReview({ snapshot, canWrite, confirm }: PilotSectionProps) {
  const { t } = useApp();
  return <section className="k-card">
    <h2>{t('Content intake review','內容提交審核')}</h2>
    {!snapshot.contentIntakes.length && <p>{t('Content intake records are missing.','缺少內容提交紀錄。')}</p>}
    {snapshot.contentIntakes.map(intake => {
      const {currentDraftRevision, currentContentDigest} = intake;
      const reviewable = !!currentDraftRevision && !!currentContentDigest;
      return <article key={intake.id} className="k-card">
      <h3>{t('Intake record','提交紀錄')} <code>{intake.id}</code></h3>
      <h4>{intake.title}</h4><p>{intake.destination}</p>
      {intake.review && <section aria-label={t('Exact draft review','確切草稿審核')}>
        <dl><dt>{t('Source summary','來源摘要')}</dt><dd>{intake.review.sourceSummary}</dd>
        <dt>{t('Sources','來源')}</dt><dd>{intake.review.sourceUrls.map(url=><p key={url}>{url}</p>)}</dd>
        <dt>{t('Rights basis and evidence','權利依據及證據')}</dt><dd>{intake.review.rightsBasis} · {intake.review.rightsEvidenceReference}</dd>
        <dt>{t('Cover rights and evidence','封面權利及證據')}</dt><dd>{String(intake.review.coverRightsConfirmed)} · {intake.review.coverRightsEvidenceReference ?? t('Not recorded','未記錄')}</dd>
        <dt>{t('Cover URL','封面網址')}</dt><dd>{intake.review.coverUrl ?? t('No cover','無封面')}</dd></dl>
        <details><summary>{t('Read bound draft preview','閱讀已連結草稿預覽')}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(intake.review.draftPreview,null,2)}</pre></details>
      </section>}
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
        {reviewable ? <form key={currentDraftRevision + ':' + currentContentDigest} style={formStyle} onSubmit={event => {
          const { value, opener } = submitData(event);
          if (!currentDraftRevision || !currentContentDigest || !value('verified')) return;
          confirm({type:'reviewContentIntake', id:intake.id, expectedRevision:intake.revision, decision:'approve',
            expectedDraftRevision:currentDraftRevision, expectedContentDigest:currentContentDigest, reason:value('reason')},
            t('Approve exact draft','批准此草稿版本'), opener);
        }}>
          <p>{t('Current draft revision','目前草稿版本')}：{currentDraftRevision}</p>
          <p>{t('Current content digest','目前內容摘要碼')}：<code>{currentContentDigest}</code></p>
          <label><input name="verified" type="checkbox" required/> {t('I reviewed this exact draft revision and digest.','我已審核此確切草稿版本和摘要碼。')}</label>
          <label>{t('Written approval reason','書面批准原因')}<textarea style={inputStyle} name="reason" required maxLength={1000}/></label>
          <button className="k-btn">{t('Approve exact draft','批准此草稿版本')}</button>
        </form> : <p role="status">{t('Current draft revision or digest is missing.','缺少目前草稿版本或摘要碼。')}</p>}
        <form style={formStyle} onSubmit={event => {
          const { value, opener } = submitData(event);
          confirm({type:'reviewContentIntake', id:intake.id, expectedRevision:intake.revision, decision:'reject', reason:value('reason')},
            t('Reject intake','拒絕內容提交'), opener);
        }}>
          <label>{t('Written review reason','書面審核原因')}<textarea style={inputStyle} name="reason" required maxLength={1000}/></label>
          <button className="k-btn">{t('Reject intake','拒絕內容提交')}</button>
        </form>
      </>}
    </article>; })}
  </section>;
}
