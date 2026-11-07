import Link from 'next/link';
import { useState } from 'react';
import type { PilotContentIntakeInput, PilotParticipantCommand, PilotSelfIntake, PilotSelfSnapshot } from '../../../lib/contracts/pilot';
import { useApp } from '../ui';

type Props = {
  intake: PilotSelfIntake | null | undefined;
  consent: PilotSelfSnapshot['contentConsent'];
  disabled: boolean;
  send: (command: PilotParticipantCommand, opener?: HTMLElement | null) => Promise<void>;
};

export function PilotContentIntakeForm({ intake, consent, disabled, send }: Props) {
  const { locale, t, href } = useApp();
  const editable = !!consent && (!intake || intake.status === 'draft' || intake.status === 'rejected');
  const [title, setTitle] = useState(intake?.title ?? '');
  const [destination, setDestination] = useState(intake?.destination ?? '');
  const [authoredLocale, setAuthoredLocale] = useState(intake?.authoredLocale ?? locale);
  const [sourceSummary, setSourceSummary] = useState(intake?.sourceSummary ?? '');
  const [urls, setUrls] = useState(intake?.sourceUrls.join('\n') ?? '');
  const [rightsBasis, setRightsBasis] = useState<PilotContentIntakeInput['rightsBasis']>(intake?.rightsBasis ?? 'original');
  const [rightsReference, setRightsReference] = useState(intake?.rightsEvidenceReference ?? '');
  const [cover, setCover] = useState(intake?.coverRightsConfirmed ?? null);
  const [coverReference, setCoverReference] = useState(intake?.coverRightsEvidenceReference ?? '');
  const [accepted, setAccepted] = useState(false);
  const status = {
    draft: t('Draft', '草稿'), rejected: t('Returned for changes', '已退回修改'),
    submitted: t('Awaiting review', '等待審核'), approved: t('Approved', '已批准'),
    published: t('Published', '已發佈'), withdrawn: t('Withdrawn', '已撤回'),
  };
  const control = { width: '100%', maxWidth: '36rem', boxSizing: 'border-box' as const };
  return <section>
    <h2>{t('Creator content intake', '創作者內容提交')}</h2>
    {intake && <>
      <p>{status[intake.status]} · {t('Intake revision', '提交版本')} {intake.revision}</p>
      {intake.reviewReason && <p>{t('Review feedback:', '審核意見：')} {intake.reviewReason}</p>}
      {intake.editorHref && <p><Link href={href(intake.editorHref.replace(/^\/(en|zh-HK)\//, ''))}>
        {t('Open bound guide in Studio', '在工作室開啟已連結攻略')}</Link>
        {intake.currentDraftRevision != null && <> · {t('Guide draft revision', '攻略草稿版本')} {intake.currentDraftRevision}</>}</p>}
      {(intake.status === 'approved' || intake.status === 'published') && <p>
        {t('Use Creator Studio to make a new guide revision.', '請使用創作者工作室建立新的攻略版本。')}</p>}
    </>}
    <form onSubmit={event => {
      event.preventDefault();
      if (!editable || !consent || disabled || !accepted) return;
      const values: PilotContentIntakeInput = {
        title, destination, authoredLocale, sourceSummary, sourceUrls: urls.split(/\r?\n/).map(url => url.trim()).filter(Boolean),
        rightsBasis, rightsEvidenceReference: rightsReference, coverRightsConfirmed: cover,
        coverRightsEvidenceReference: cover === true ? coverReference : null,
        authorConsentVersion: consent.version, authorConsentDigest: consent.digest,
      };
      const requestId = crypto.randomUUID();
      void send(intake
        ? { type: 'updateOwnedContentIntake', requestId, id: intake.id, expectedRevision: intake.revision, intake: values }
        : { type: 'submitContentIntake', requestId, intake: values },
      event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null);
    }}>
      <fieldset disabled={disabled || !editable} style={{ minWidth: 0, marginInline: 0 }}>
        <legend>{editable ? t('Intake details', '提交資料') : t('Intake details (read only)', '提交資料（唯讀）')}</legend>
        <p><label>{t('Title', '標題')}<br/><input style={control} required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></label></p>
        <p><label>{t('Destination', '目的地')}<br/><input style={control} required maxLength={160} value={destination} onChange={e => setDestination(e.target.value)}/></label></p>
        <p><label>{t('Content language code', '內容語言代碼')}<br/><input style={control} required minLength={2} maxLength={20} value={authoredLocale} onChange={e => setAuthoredLocale(e.target.value)}/></label></p>
        <p><label>{t('Source summary', '來源摘要')}<br/><textarea style={control} required maxLength={4000} value={sourceSummary} onChange={e => setSourceSummary(e.target.value)}/></label></p>
        <p><label>{t('Source URLs (one per line, up to 20)', '來源網址（每行一個，最多 20 個）')}<br/><textarea style={control} maxLength={40980} value={urls} onChange={e => setUrls(e.target.value)}/></label></p>
        <p><label>{t('Rights basis', '權利依據')}<br/><select style={control} value={rightsBasis} onChange={e => setRightsBasis(e.target.value as typeof rightsBasis)}>
          <option value="original">{t('Original work', '原創作品')}</option>
          <option value="licence">{t('Licence', '授權條款')}</option>
          <option value="permission">{t('Permission', '使用許可')}</option>
        </select></label></p>
        <p><label>{t('Rights evidence reference', '權利證明參考資料')}<br/><input style={control} required maxLength={500} value={rightsReference} onChange={e => setRightsReference(e.target.value)}/></label></p>
        <p><label>{t('Cover rights', '封面使用權')}<br/><select style={control} value={cover === null ? '' : String(cover)}
          onChange={e => setCover(e.target.value === '' ? null : e.target.value === 'true')}>
          <option value="">{t('Not specified', '未指定')}</option>
          <option value="true">{t('Confirmed', '已確認')}</option>
          <option value="false">{t('Not confirmed', '未確認')}</option>
        </select></label></p>
        {(cover === true || !editable && coverReference) && <p><label>{t('Cover rights evidence reference', '封面權利證明參考資料')}<br/>
          <input style={control} required maxLength={500} value={coverReference} onChange={e => setCoverReference(e.target.value)}/>
        </label></p>}
        {editable && consent && <>
          <p>{t('Review the content consent notice supplied by your pilot coordinator.', '請閱讀試行計劃協調員提供的內容同意通知。')}</p>
          <p>{t('Content consent version and SHA-256:', '內容同意版本及 SHA-256：')} {consent.version}<br/><code>{consent.digest}</code></p>
          <p><label><input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)}/>{' '}
            {t('I agree to this content consent notice.', '我同意此內容同意通知。')}</label></p>
          <button className="k-btn primary">{intake ? t('Resubmit intake', '重新提交資料') : t('Submit intake', '提交資料')}</button>
        </>}
      </fieldset>
    </form>
  </section>;
}
