'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ErrorCode } from '../../../lib/contracts/capabilities';
import type { OpsPilotCommand, OpsPilotSnapshot } from '../../../lib/contracts/pilot';
import { parseOpsPilotCommand } from '../../../lib/contracts/pilot';
import { ops } from '../../../lib/ops/repository';
import { pilotExportSummary } from '../../../lib/pilot/readiness';
import { opsPilot } from '../../../lib/pilot/repository';
import { subscribeAccountInvalidation } from '../../../lib/trips/local-drafts';
import { Modal, useApp } from '../ui';
import { PilotParticipants } from './PilotParticipants';
import { PilotContentReview } from './PilotContentReview';
import { PilotChecks } from './PilotChecks';
import { PilotRun, stageLabels, type PilotActions } from './PilotRun';

type Props = { actorId: string | null; enabled: boolean; runId: string | null };
type Intent = { command: OpsPilotCommand; label: string; opener: HTMLElement };
export function PilotControlRoom(props: Props) {
  return <PilotSession key={JSON.stringify([props.actorId, props.enabled, props.runId])} {...props}/>;
}

function PilotSession({ actorId, enabled, runId }: Props) {
  const { t, href } = useApp();
  const [snapshot, setSnapshot] = useState<OpsPilotSnapshot | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Intent | null>(null);
  const [invite, setInvite] = useState<{ code: string; id: string; opener: HTMLElement } | null>(null);
  const [copied, setCopied] = useState('');
  const active = useRef(false);
  const sending = useRef(false);
  const pending = useRef<Intent | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedRun = useRef(runId);

  useEffect(() => {
    active.current = true;
    const unsubscribe = subscribeAccountInvalidation(next => {
      if (next === actorId) return;
      active.current = false;
      pending.current = null;
      setInvalid(true);
      setSnapshot(null);
      setConfirmation(null);
      setInvite(null);
    });
    return () => { active.current = false; unsubscribe(); };
  }, [actorId]);

  useEffect(() => {
    if (!actorId || !enabled || invalid) return;
    let current = true;
    setSnapshot(null);
    setError(null);
    void Promise.all([opsPilot.get(selectedRun.current ?? undefined, actorId), ops.routing()]).then(([result, routing]) => {
      if (!current || !active.current) return;
      if (!result.ok) { setError(result.code); return; }
      setCanWrite(routing.ok && routing.data.canAssign === true);
      setSnapshot(result.data);
      selectedRun.current = result.data.run?.id ?? selectedRun.current;
    });
    return () => { current = false; };
  }, [actorId, enabled, invalid, refresh]);

  const confirm: PilotActions['confirm'] = (command, label, opener) => {
    if (!canWrite || pending.current || confirmation || invite || !active.current) return;
    try {
      setConfirmation({ command: parseOpsPilotCommand(command), label, opener });
      setNotice('');
    } catch {
      setNotice(t('Check the values and try again.', '請檢查輸入值後重試。'));
    }
  };

  async function send(intent: Intent) {
    if (!actorId || !canWrite || !active.current || sending.current) return;
    sending.current = true;
    pending.current = intent;
    setBusy(true);
    setNotice('');
    const result = await opsPilot.command(intent.command, actorId);
    sending.current = false;
    if (!active.current) return;
    setBusy(false);
    if (!result.ok && (result.code === 'FORBIDDEN' || result.code === 'AUTH_REQUIRED')) {
      setSnapshot(null);
      setCanWrite(false);
      setConfirmation(null);
      setInvite(null);
      setError(result.code);
      return;
    }
    if (!result.ok && result.retryable) {
      setUnknown(true);
      return;
    }
    setUnknown(false);
    pending.current = null;
    setConfirmation(null);
    if (!result.ok) {
      setCanWrite(false);
      setNotice(t('The change was rejected. Refresh before trying again.', '變更被拒絕。請重新載入後再試。'));
      restoreFocus(intent.opener);
      return;
    }
    setSnapshot(result.data.snapshot);
    selectedRun.current = result.data.snapshot.run?.id ?? selectedRun.current;
    if (intent.command.type === 'createInvite' && result.data.inviteCode) {
      setCopied('');
      setInvite({ code: result.data.inviteCode, id: intent.command.id, opener: intent.opener });
    } else {
      restoreFocus(intent.opener);
      setNotice(intent.command.type === 'createInvite'
        ? t('The code cannot be retrieved; rotate it to get a new code.', '無法取回邀請碼，請更換以取得新碼。')
        : t('Change saved.', '已儲存變更。'));
    }
  }

  function restoreFocus(opener: HTMLElement) {
    requestAnimationFrame(() => {
      if (opener.isConnected && !opener.matches(':disabled')) opener.focus();
      else heading.current?.focus();
    });
  }

  function download(data: OpsPilotSnapshot) {
    const blob = new Blob([JSON.stringify(pilotExportSummary(data, new Date().toISOString()), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pilot-acceptance-summary.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(t('Acceptance summary exported.', '已匯出驗收摘要。'));
  }

  const actions = { canWrite, confirm };
  const run = snapshot?.run;
  const mutable = canWrite && !!run && !['completed', 'cancelled'].includes(run.status);
  const regular = mutable && run?.status !== 'paused';
  const signIn = !actorId || invalid || error === 'AUTH_REQUIRED';
  const path = 'ops?view=pilot' + (runId ? '&id=' + encodeURIComponent(runId) : '');
  return <section className="k-page" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h1 ref={heading} tabIndex={-1}>{t('Pilot control room', '試行計劃控制室')}</h1>
    <nav className="k-nav-chips" aria-label={t('Operations navigation', '營運導覽')}>
      <Link href={href('ops?view=overview')}>{t('Operations overview', '營運總覽')}</Link>
      <Link href={href('ops')}>{t('Review queue', '審核待辦')}</Link>
    </nav>
    {signIn ? <Link href={href('sign-in?next=' + encodeURIComponent(href(path)))}>{t('Sign in to continue', '登入後繼續')}</Link>
      : !enabled ? <p role="status">{t('Operations services are disconnected.', '營運服務尚未接通。')}</p>
      : error === 'FORBIDDEN' ? <p role="alert">{t('Access denied. An active operations role is required.', '拒絕存取。需要有效的營運角色。')}</p>
      : <>
        {error && <p role="alert">{error === 'NOT_FOUND' ? t('Pilot run record not found.', '找不到試行計劃紀錄。') : t('The pilot could not be loaded. It may be disconnected.', '未能載入試行計劃，服務可能尚未接通。')}</p>}
        {!snapshot && !error && <p role="status">{t('Loading pilot…', '正在載入試行計劃…')}</p>}
        <button type="button" className="k-btn" disabled={!!confirmation || !!invite || !!pending.current} onClick={() => setRefresh(x => x + 1)}>{t('Refresh pilot', '重新載入試行計劃')}</button>
        {snapshot && <>
          {!canWrite && <p role="status">{t('Read only. Changes require an operations admin or owner.', '唯讀。變更需要營運管理員或擁有者。')}</p>}
          <section className="k-card">
            <h2>{t(...stageLabels[snapshot.readiness.stage])}</h2>
            {snapshot.readiness.blockers.length > 0 && <ul aria-label={t('Readiness blockers', '就緒障礙')}>
              {snapshot.readiness.blockers.map(({ category, code, recordId }) => <li key={JSON.stringify([category, code, recordId])}>
                {category}: {code.replace(/[_.]/g, ' ')}{recordId && <> · {t('Record', '紀錄')} {recordId}</>}
              </li>)}
            </ul>}
            {run && <button type="button" className="k-btn" onClick={() => download(snapshot)}>{t('Export acceptance summary', '匯出驗收摘要')}</button>}
          </section>
          <PilotRun snapshot={snapshot} {...actions}/>
          {run && <>
            <PilotParticipants snapshot={snapshot} {...actions} canWrite={mutable} regular={regular}/>
            <PilotContentReview snapshot={snapshot} {...actions} canWrite={regular}/>
            <PilotChecks snapshot={snapshot} {...actions} canWrite={regular && run.status === 'running'}/>
          </>}
        </>}
        <p role="status">{notice}</p>
      </>}
    {confirmation && <Modal title={confirmation.label} returnFocus={confirmation.opener} onClose={() => {
      if (!pending.current && !sending.current) setConfirmation(null);
    }}>
      <p>{t('Confirm this change to the pilot record.', '確認變更試行計劃紀錄。')}</p>
      {unknown && <p role="alert">{t('Outcome unknown. Retry the same request.', '結果未明。請重試相同請求。')}</p>}
      <button type="button" className="k-btn primary" disabled={busy} onClick={() => void send(pending.current ?? confirmation)}>
        {unknown ? t('Retry same request', '重試相同請求') : t('Confirm', '確認')}
      </button>
    </Modal>}
    {invite && <Modal key="one-time-invite" title={t('One-time invitation code', '一次性邀請碼')} returnFocus={invite.opener} onClose={() => {
      setInvite(null);
      setCopied('');
      restoreFocus(invite.opener);
    }}>
      <p>{t('Copy this code before closing. Closing removes it from this page.', '請在關閉前複製邀請碼。關閉後此頁將移除邀請碼。')}</p>
      <p>{t('Keep this record ID if you need to revoke the invitation:', '如需撤銷邀請，請保留此紀錄 ID：')} <code>{invite.id}</code></p>
      <label>{t('Invitation code', '邀請碼')} <input readOnly autoComplete="off" spellCheck={false} value={invite.code} onFocus={e => e.currentTarget.select()} style={{ maxWidth: '100%' }}/></label>
      <button type="button" className="k-btn" onClick={async () => {
        try {
          await navigator.clipboard.writeText(invite.code);
          if (active.current) setCopied(t('Code copied.', '已複製邀請碼。'));
        } catch {
          if (active.current) setCopied(t('Clipboard unavailable. Select and copy the code manually.', '無法使用剪貼簿。請選取並手動複製邀請碼。'));
        }
      }}>{t('Copy code', '複製邀請碼')}</button>
      <p role="status">{copied}</p>
    </Modal>}
  </section>;
}
