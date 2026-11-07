import type { FormEvent } from 'react';
import type { OpsPilotCommand, OpsPilotSnapshot, PilotReadinessStage, PilotRunStatus } from '../../../lib/contracts/pilot';
import { useApp } from '../ui';

export type PilotActions = {
  canWrite: boolean;
  confirm: (command: OpsPilotCommand, label: string, opener: HTMLElement) => void;
};
export type PilotSectionProps = PilotActions & { snapshot: OpsPilotSnapshot };
export const stageLabels: Record<PilotReadinessStage, [string, string]> = {
  setup_incomplete: ['Setup incomplete', '設定未完成'],
  ready_to_begin: ['Ready to begin', '可開始'],
  executing: ['Executing', '執行中'],
  execution_complete: ['Execution complete', '執行已完成'],
  completed: ['Completed', '已結束'],
  blocked: ['Blocked', '受阻'],
};
export const runStatusLabels: Record<PilotRunStatus, [string, string]> = {
  draft: ['Draft', '草稿'], recruiting: ['Recruiting', '招募中'], running: ['Running', '進行中'],
  paused: ['Paused', '已暫停'], completed: ['Completed', '已結束'], cancelled: ['Cancelled', '已取消'],
};
export function submitData(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const opener = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
  return { value: (key: string) => String(form.get(key) ?? '').trim(), opener: opener ?? event.currentTarget };
}
export const formStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '0.75rem', minWidth: 0 };
export const inputStyle = { display: 'block', maxWidth: '100%', boxSizing: 'border-box' } as const;
export const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

const configuration = [
  ['participationNoticeVersion','Participation notice version','參與通知版本'],
  ['privacyNoticeVersion','Privacy notice version','私隱通知版本'],
  ['contentConsentVersion','Content consent version','內容同意版本'],
  ['coordinatorReference','Coordinator reference','協調員參照'],
  ['supportOwnerReference','Support owner reference','客服負責人參照'],
  ['privacyOwnerReference','Privacy owner reference','私隱負責人參照'],
  ['alertOwnerReference','Alert owner reference','警報負責人參照'],
  ['privateChannelReference','Private channel reference','私人渠道參照'],
] as const;
const transitions: Record<PilotRunStatus, PilotRunStatus[]> = {
  draft: ['recruiting','cancelled'], recruiting: ['running','paused','cancelled'],
  running: ['paused','completed','cancelled'], paused: ['recruiting','running','cancelled'],
  completed: [], cancelled: [],
};

export function PilotRun({ snapshot, canWrite, confirm }: PilotSectionProps) {
  const { t } = useApp();
  const { run, readiness } = snapshot;
  const statuses = run ? transitions[run.status].filter(status =>
    status === 'completed' ? readiness.executionComplete
      : !['recruiting','running'].includes(status) || readiness.readyToBegin || run.status === 'paused') : [];
  return <section className="k-card">
    <h2>{t('Pilot run', '試行計劃')}</h2>
    {run ? <>
      <p>{t('Run record', '計劃紀錄')} <code>{run.id}</code> · {t(...runStatusLabels[run.status])} · {run.dataClassification === 'real' ? t('Real participation', '真實參與') : t('Synthetic rehearsal', '模擬演練')}</p>
      <p>{t('Acceptance started', '驗收開始')}：{run.acceptanceStartedAt
        ? <time dateTime={run.acceptanceStartedAt}>{run.acceptanceStartedAt}</time> : t('Not started', '未開始')}</p>
      <p>{t('Release and environment', '版本與環境')}：{run.candidateReleaseSha} · {run.environmentOrigin}</p>
    </> : <p>{t('Pilot run record is missing.', '缺少試行計劃紀錄。')}</p>}
    {canWrite && (!run || ['completed','cancelled'].includes(run.status)) && <form style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      confirm({type:'createRun', id:crypto.randomUUID(), name:value('name'),
        dataClassification:value('classification') === 'real' ? 'real' : 'synthetic',
        candidateReleaseSha:value('sha'), environmentOrigin:value('origin')}, t('Create pilot run','建立試行計劃'), opener);
    }}>
      <label>{t('Run name','計劃名稱')}<input style={inputStyle} name="name" maxLength={200} required/></label>
      <label>{t('Data classification','資料分類')}<select style={inputStyle} name="classification"><option value="synthetic">{t('Synthetic rehearsal','模擬演練')}</option><option value="real">{t('Real participation','真實參與')}</option></select></label>
      <label>{t('Candidate release SHA','候選版本 SHA')}<input style={inputStyle} name="sha" maxLength={80} required/></label>
      <label>{t('Environment origin','環境來源網址')}<input style={inputStyle} type="url" name="origin" maxLength={2048} required/></label>
      <button className="k-btn">{t('Create pilot run','建立試行計劃')}</button>
    </form>}
    {canWrite && run?.status === 'draft' && !snapshot.participants.some(slot => slot.userLinked) && <form key={run.id + ':' + run.revision} style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      confirm({type:'configureRun', id:run.id, expectedRevision:run.revision,
        participationNoticeVersion:value('participationNoticeVersion'), privacyNoticeVersion:value('privacyNoticeVersion'),
        contentConsentVersion:value('contentConsentVersion'), coordinatorReference:value('coordinatorReference'),
        supportOwnerReference:value('supportOwnerReference'), privacyOwnerReference:value('privacyOwnerReference'),
        alertOwnerReference:value('alertOwnerReference'), privateChannelReference:value('privateChannelReference'),
        syntheticRehearsalRunId:value('rehearsal') || null}, t('Configure run','設定計劃'), opener);
    }}>
      <h3>{t('Run setup','計劃設定')}</h3>
      <p>{t('Use opaque references for owners and channels. Do not enter contact details.', '請使用代號作為負責人及渠道參照。請勿輸入聯絡資料。')}</p>
      {configuration.map(([name,en,zh]) => <label key={name}>{t(en,zh)}
        <input style={inputStyle} name={name} maxLength={name.endsWith('Version') ? 120 : 200} required defaultValue={name === 'participationNoticeVersion' || name === 'privacyNoticeVersion' || name === 'contentConsentVersion' ? run[name] ?? '' : ''}/>
      </label>)}
      <label>{t('Completed rehearsal run ID','已完成演練的計劃 ID')}<input style={inputStyle} name="rehearsal" pattern={uuidPattern} required={run.dataClassification === 'real'}/></label>
      <button className="k-btn">{t('Configure run','設定計劃')}</button>
    </form>}
    {canWrite && run && statuses.length > 0 && <form style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      const status = statuses.find(option => option === value('status'));
      if (status) confirm({type:'setRunStatus', id:run.id, expectedRevision:run.revision, status, reason:value('reason')},
        t('Change run status','變更計劃狀態') + ': ' + t(...runStatusLabels[status]), opener);
    }}>
      <label>{t('Next run status','下一個計劃狀態')}<select style={inputStyle} name="status" defaultValue="" required><option value="" disabled>{t('Select a status','選擇狀態')}</option>{statuses.map(status => <option key={status} value={status}>{t(...runStatusLabels[status])}</option>)}</select></label>
      <label>{t('Written reason','書面原因')}<textarea style={inputStyle} name="reason" maxLength={1000} required/></label>
      <button className="k-btn">{t('Change run status','變更計劃狀態')}</button>
    </form>}
  </section>;
}
