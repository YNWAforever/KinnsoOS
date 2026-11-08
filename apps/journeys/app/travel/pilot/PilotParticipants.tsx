import type { OpsPilotParticipantView, PilotRole } from '../../../lib/contracts/pilot';
import { useApp } from '../ui';
import { formStyle, inputStyle, submitData, uuidPattern, type PilotSectionProps } from './PilotRun';

const roles = { traveller: ['Traveller','旅客'], creator: ['Creator','創作者'], merchant: ['Merchant','商戶'] } as const;
const statuses = {
  invited:['Invited','已邀請'], joined:['Joined','已加入'], active:['Active','啟用'], paused:['Paused','已暫停'],
  withdrawn:['Withdrawn','已退出'], completed:['Completed','已完成'],
} as const;

export function PilotParticipants({ snapshot, canWrite, regular, confirm }: PilotSectionProps & { regular: boolean }) {
  const { t } = useApp();
  const { run, participants, collaboration } = snapshot;
  if (!run) return null;
  return <section className="k-card">
    <h2>{t('Participant slots','參與者名額')}</h2>
    {!participants.length && <p>{t('Participant slot records are missing.','缺少參與者名額紀錄。')}</p>}
    {participants.map(slot => <article className="k-card" key={slot.id}>
      <h3>{t(roles[slot.role][0], roles[slot.role][1])} · {slot.cohortRole === 'observer' ? t('Observer','觀察員') : t('Required slot','必要名額')}</h3>
      <p><code>{slot.id}</code> · {t(statuses[slot.status][0], statuses[slot.status][1])}</p>
      <p>{slot.userLinked ? t('Account linked','已連結帳戶') : t('Account link missing','未連結帳戶')} · {slot.consentAccepted ? t('Consent recorded','已記錄同意') : t('Consent missing','缺少同意紀錄')}</p>
      {canWrite && <SlotActions slot={slot} regular={regular} confirm={confirm}/>}
    </article>)}
    {regular && participants.length < 20 && <form style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      const role = value('role') as PilotRole;
      if (!Object.hasOwn(roles, role)) return;
      confirm({type:'addParticipant', id:crypto.randomUUID(), runId:run.id, role,
        cohortRole:value('cohort') === 'observer' ? 'observer' : `required_${role}`, displayLabel:value('label')},
        t('Add participant slot','新增參與者名額'), opener);
    }}>
      <label>{t('Role','角色')}<select style={inputStyle} name="role">{Object.entries(roles).map(([role, label]) => <option value={role} key={role}>{t(label[0], label[1])}</option>)}</select></label>
      <label>{t('Cohort role','組別角色')}<select style={inputStyle} name="cohort"><option value="required">{t('Required slot','必要名額')}</option><option value="observer">{t('Observer','觀察員')}</option></select></label>
      <label>{t('Slot label (no personal details)','名額代號（請勿填寫個人資料）')}<input style={inputStyle} name="label" maxLength={80} required/></label>
      <button className="k-btn">{t('Add participant slot','新增參與者名額')}</button>
    </form>}
    <h3>{t('Campaign collaboration','活動協作')}</h3>
    {collaboration?.missionId ? <>
      <p>{t('Bound campaign record','已連結的活動紀錄')} <code>{collaboration.missionId}</code></p>
      <ul>{collaboration.steps.map(step => <li key={step.code}>{step.code.replaceAll('_',' ')}: {step.status}</li>)}</ul>
    </> : <p>{t('Campaign binding record is missing.','缺少活動連結紀錄。')}</p>}
    {regular && !collaboration && ['merchant','creator'].every(role => participants.some(slot => slot.role === role && slot.status === 'active')) &&
      <form style={formStyle} onSubmit={event => {
        const { value, opener } = submitData(event);
        confirm({type:'bindCollaboration', id:crypto.randomUUID(), runId:run.id, merchantParticipantId:value('merchant'),
          creatorParticipantId:value('creator'), missionId:value('mission')}, t('Bind campaign','連結活動'), opener);
      }}>
        {(['merchant','creator'] as const).map(role => <label key={role}>{t(roles[role][0], roles[role][1])}
          <select style={inputStyle} name={role} required defaultValue=""><option value="" disabled>{t('Select a slot','選擇名額')}</option>
            {participants.filter(slot => slot.role === role && slot.status === 'active').map(slot => <option key={slot.id} value={slot.id}>{slot.id}</option>)}
          </select>
        </label>)}
        <label>{t('Campaign ID','活動 ID')}<input style={inputStyle} name="mission" pattern={uuidPattern} required/></label>
        <button className="k-btn">{t('Bind campaign','連結活動')}</button>
      </form>}
  </section>;
}

function SlotActions({ slot, regular, confirm }: { slot: OpsPilotParticipantView; regular: boolean; confirm: PilotSectionProps['confirm'] }) {
  const { t } = useApp();
  if (slot.status === 'withdrawn' || slot.status === 'completed') return null;
  const next = (['active','paused','withdrawn'] as const).filter(status =>
    status !== slot.status && (status !== 'active' || slot.userLinked && slot.consentAccepted));
  return <>
    {regular && slot.status === 'invited' && !slot.userLinked && <>
      <p>{t('A previous code cannot be retrieved; rotate it to get a new code.','無法取回舊邀請碼，請更換以取得新碼。')}</p>
      <button type="button" className="k-btn" onClick={e => confirm({type:'createInvite', id:crypto.randomUUID(),
        participantId:slot.id, expectedRevision:slot.revision, expiresInHours:24},
        t('Generate or rotate a 24-hour invitation code','產生或更換有效期為 24 小時的邀請碼'), e.currentTarget)}>
        {t('Generate or rotate code','產生或更換邀請碼')}
      </button>
    </>}
    <form style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      const status = next.find(option => option === value('status'));
      if (status) confirm({type:'setParticipantStatus', id:slot.id, expectedRevision:slot.revision, status, reason:value('reason')},
        t('Change slot status','變更名額狀態') + ': ' + t(statuses[status][0], statuses[status][1]), opener);
    }}>
      <label>{t('Next slot status','下一個名額狀態')}<select style={inputStyle} name="status" required defaultValue=""><option value="" disabled>{t('Select a status','選擇狀態')}</option>{next.map(status => <option key={status} value={status}>{t(statuses[status][0], statuses[status][1])}</option>)}</select></label>
      <label>{t('Written reason','書面原因')}<textarea style={inputStyle} name="reason" maxLength={1000} required/></label>
      <button className="k-btn">{t('Change slot status','變更名額狀態')}</button>
    </form>
    {slot.activeInvite && <form style={formStyle} onSubmit={event => {
      const { value, opener } = submitData(event);
      if (!slot.activeInvite) return;
      confirm({type:'revokeInvite', id:slot.activeInvite.id, participantId:slot.id, expectedRevision:slot.revision,
        reason:value('reason')}, t('Revoke invitation','撤銷邀請'), opener);
    }}>
      <p>{t('Active invitation','有效邀請')} <code>{slot.activeInvite.id}</code> · {t('Expires','到期')} <time dateTime={slot.activeInvite.expiresAt}>{slot.activeInvite.expiresAt}</time></p>
      <label>{t('Written reason','書面原因')}<textarea style={inputStyle} name="reason" maxLength={1000} required/></label>
      <button className="k-btn">{t('Revoke invitation','撤銷邀請')}</button>
    </form>}
  </>;
}
