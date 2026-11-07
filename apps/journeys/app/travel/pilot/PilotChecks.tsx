import type { OpsPilotCheckView, PilotCheckStatus } from '../../../lib/contracts/pilot';
import { useApp } from '../ui';
import { formStyle, inputStyle, submitData, uuidPattern, type PilotSectionProps } from './PilotRun';

const statusLabels = {
  not_run:['Not run','未執行'], pass:['Passed','通過'], fail:['Failed','未通過'], blocked:['Blocked','受阻'],
} as const;

export function PilotChecks({ snapshot, canWrite, confirm }: PilotSectionProps) {
  const { t } = useApp();
  const run = snapshot.run;
  if (!run) return null;
  return <section className="k-card">
    <h2>{t('Acceptance checks','驗收檢查')}</h2>
    {!snapshot.checks.length && <p>{t('Check records are missing.','缺少驗收檢查紀錄。')}</p>}
    {snapshot.checks.map(check => <article className="k-card" key={check.code}>
      <h3>{check.code.replaceAll('_',' ')}</h3>
      <p>{t(statusLabels[check.status][0], statusLabels[check.status][1])} · {check.derived ? t('Evaluated from source records','依來源紀錄評估') : t('Manual evidence required','需要人工證據')}</p>
      {check.evidenceReference && /^ref:(?:[0-9]{1,20}|[0-9a-f-]{36})$/i.test(check.evidenceReference) && <p>{t('Evidence reference','證據參照')} <code>{check.evidenceReference}</code></p>}
      {canWrite && !check.derived && <ManualCheck check={check} runId={run.id} confirm={confirm}/>}
      {canWrite && (check.code === 'guide_discovered' || check.code === 'trip_recovered') && <form style={formStyle} onSubmit={event => {
        const { value, opener } = submitData(event);
        confirm({type:'addEvidenceReference', runId:run.id, checkCode:check.code,
          entityType:check.code === 'guide_discovered' ? 'guide' : 'trip', entityId:value('record'),
          participantId:value('participant'), evidenceReference:value('reference')}, t('Attach evidence reference','附加證據參照'), opener);
      }}>
        <label>{check.code === 'guide_discovered' ? t('Guide ID','指南 ID') : t('Trip ID','行程 ID')}<input style={inputStyle} name="record" pattern={uuidPattern} required/></label>
        <label>{t('Traveller slot','旅客名額')}<select style={inputStyle} name="participant" required defaultValue=""><option value="" disabled>{t('Select a slot','選擇名額')}</option>
          {snapshot.participants.filter(slot => slot.role === 'traveller' && slot.status === 'active').map(slot => <option key={slot.id} value={slot.id}>{slot.id}</option>)}</select></label>
        <EvidenceField required/>
        <button className="k-btn">{t('Attach evidence reference','附加證據參照')}</button>
      </form>}
    </article>)}
  </section>;
}

function EvidenceField({ required }: { required?: boolean }) {
  const { t } = useApp();
  return <label>{t('Opaque evidence reference (ref: followed by an ID)','證據參照（ref: 後加 ID）')}
    <input name="reference" style={inputStyle} pattern={`ref:(?:[0-9]{1,20}|${uuidPattern})`} required={required}/>
  </label>;
}

function ManualCheck({ check, runId, confirm }: { check: OpsPilotCheckView; runId: string; confirm: PilotSectionProps['confirm'] }) {
  const { t } = useApp();
  return <>
    <form style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      confirm({type:'addEvidenceReference', runId, checkCode:check.code, entityType:'manual', entityId:runId,
        evidenceReference:value('reference')}, t('Attach evidence reference','附加證據參照'), opener);
    }}>
      <EvidenceField required/>
      <button className="k-btn">{t('Attach evidence reference','附加證據參照')}</button>
    </form>
    {check.id ? <form style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      if (!check.id) return;
      confirm({type:'setManualCheck', id:check.id, expectedRevision:check.revision,
        status:value('status') as PilotCheckStatus, evidenceReference:value('reference') || null,
        observedSummary:value('observation') || null}, t('Record manual check result','記錄人工檢查結果'), opener);
    }}>
      <label>{t('Result','結果')}<select name="status" style={inputStyle} defaultValue={check.status}>{Object.entries(statusLabels).map(([status,label]) => <option key={status} value={status}>{t(label[0], label[1])}</option>)}</select></label>
      <EvidenceField/>
      <label>{t('Observation (no private text; required to pass)','觀察紀錄（請勿填寫私人內容；通過時必填）')}<textarea style={inputStyle} name="observation" maxLength={1000}/></label>
      <button className="k-btn">{t('Record manual check result','記錄人工檢查結果')}</button>
    </form> : <p>{t('Manual check record ID is missing.','缺少人工檢查紀錄 ID。')}</p>}
  </>;
}
