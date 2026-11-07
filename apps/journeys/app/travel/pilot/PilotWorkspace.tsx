'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { PilotParticipantCommand, PilotSelfSnapshot } from '../../../lib/contracts/pilot';
import { parsePilotParticipantCommand } from '../../../lib/contracts/pilot';
import { pilot } from '../../../lib/pilot/repository';
import { useApp } from '../ui';
import { PilotContentIntakeForm } from './PilotContentIntakeForm';

type Props = { actorId: string | null; enabled: boolean };

export function PilotWorkspace(props: Props) {
  return <ParticipantSession key={JSON.stringify([props.actorId, props.enabled])} {...props}/>;
}

function ParticipantSession({ actorId, enabled }: Props) {
  const { t, href } = useApp();
  const [snapshot, setSnapshot] = useState<PilotSelfSnapshot | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState('');
  const active = useRef(false);
  const sending = useRef(false);
  const read = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const unknown = !!pilot.hasPending(actorId) && !busy;

  useEffect(() => {
    pilot.selectActor(actorId);
    active.current = true;
    const unsubscribe = pilot.subscribeInvalidation(next => {
      if (next === actorId) return;
      active.current = false;
      pilot.selectActor(next);
      setInvalid(true);
      setSnapshot(null);
      setCode('');
      setFeedback('');
      heading.current?.focus();
    });
    return () => { active.current = false; unsubscribe(); };
  }, [actorId]);

  useEffect(() => {
    if (!actorId || !enabled || invalid) return;
    const controller = new AbortController();
    read.current = controller;
    void pilot.get(actorId, controller.signal).then(result => {
      if (controller.signal.aborted || !active.current) return;
      if (result.ok) {
        setSnapshot(result.data);
        setAccessLost(false);
        setReadFailed(false);
      } else {
        setSnapshot(null);
        setCode('');
        setAccessLost(result.code === 'AUTH_REQUIRED' || result.code === 'FORBIDDEN');
        setReadFailed(true);
      }
    });
    return () => controller.abort();
  }, [actorId, enabled, invalid, refresh]);

  async function send(command?: PilotParticipantCommand, opener?: HTMLElement | null) {
    if (!actorId || !active.current || sending.current || command && pilot.hasPending(actorId)) return;
    let parsed: PilotParticipantCommand | undefined;
    try {
      if (command) parsed = parsePilotParticipantCommand(command);
    } catch {
      setFeedback(command?.type === 'claimInvite'
        ? t('This invitation code could not be used.', '無法使用此邀請碼。')
        : t('Check your entries and try again.', '請檢查輸入後再試。'));
      return;
    }
    read.current?.abort();
    sending.current = true;
    setBusy(true);
    setFeedback('');
    const result = await (parsed ? pilot.command(parsed, actorId) : pilot.retry(actorId));
    sending.current = false;
    if (!active.current) return;
    setBusy(false);
    if (result.ok) {
      setSnapshot(result.data.snapshot);
      setAccessLost(false);
      setReadFailed(false);
      setFeedback(t('Saved.', '已儲存。'));
      // Replay can belong to a previously selected run. Refresh the selected self view.
      if (!parsed) {
        setSnapshot(null);
        setRefresh(value => value + 1);
      }
    } else if (result.code === 'AUTH_REQUIRED' || result.code === 'FORBIDDEN') {
      setAccessLost(true);
      setSnapshot(null);
      setCode('');
    } else if (!result.retryable) {
      if (!parsed && !snapshot) setRefresh(value => value + 1);
      setFeedback(parsed?.type === 'claimInvite' || !snapshot?.participant
        ? t('This invitation code could not be used.', '無法使用此邀請碼。')
        : t('The change could not be saved. Refresh before trying again.', '無法儲存變更。請重新載入後再試。'));
    }
    requestAnimationFrame(() => {
      if (!active.current) return;
      if (retry.current) retry.current.focus();
      else if (opener?.isConnected && !opener.matches(':disabled')) opener.focus();
      else heading.current?.focus();
    });
  }

  const run = snapshot?.run;
  const participant = snapshot?.participant;
  const step = snapshot?.nextStep;
  const intake = snapshot?.intake;
  const canWork = step?.code === 'open_workflow' && participant?.status === 'active';
  const claimable = snapshot && (!participant || participant.status === 'invited' && run &&
    (run.status === 'recruiting' || run.status === 'running'));
  const blocked = busy || unknown;
  const local = (path: string) => href(path.replace(/^\/(en|zh-HK)\//, ''));
  const roleLink = participant?.role === 'merchant' ? snapshot?.workflowLinks?.merchant
    : participant?.role === 'traveller' ? snapshot?.workflowLinks?.trip : null;
  const refreshView = () => {
    setSnapshot(null);
    setCode('');
    setFeedback('');
    setReadFailed(false);
    setRefresh(value => value + 1);
  };

  return <section className="k-page" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h1 ref={heading} tabIndex={-1}>{t('Pilot participation', '試行計劃參與')}</h1>
    {!enabled ? <p role="status">{t('Pilot participation is unavailable.', '試行計劃暫未開放。')}</p>
      : !actorId || invalid || accessLost ? <p><Link href={href('sign-in?next=' + encodeURIComponent(href('pilot')))}>
        {t('Sign in to continue', '登入後繼續')}</Link></p>
      : !snapshot && !readFailed ? <p role="status">{t('Loading pilot participation…', '正在載入試行計劃…')}</p>
      : readFailed ? <p role="alert">{t('Pilot participation could not be loaded.', '未能載入試行計劃。')}</p>
      : <>
        {participant && run ? <h2>{run.name}</h2> : <p>{t('No pilot slot is available for this account.', '此帳戶未有可用的試行計劃名額。')}</p>}
        {claimable && <form onSubmit={event => {
          event.preventDefault();
          const submitted = code.trim();
          setCode('');
          if (!/^[a-f0-9]{64}$/.test(submitted)) {
            setFeedback(t('This invitation code could not be used.', '無法使用此邀請碼。'));
            return;
          }
          void send({ type: 'claimInvite', requestId: crypto.randomUUID(), code: submitted }, event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null);
        }}>
          <label>{t('Invitation code', '邀請碼')}{' '}
            <input type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
              style={{ maxWidth: '100%', boxSizing: 'border-box' }} required value={code} disabled={blocked}
              onChange={event => setCode(event.target.value)}/>
          </label>{' '}
          <button className="k-btn" disabled={blocked}>{t('Claim invitation', '使用邀請碼')}</button>
        </form>}
        {step?.code === 'accept_consent' && run?.participationNoticeVersion && run.participationNoticeDigest &&
          run.privacyNoticeVersion && run.privacyNoticeDigest && <section>
            <h2>{t('Participation and privacy consent', '參與及私隱同意')}</h2>
            <p>{t('Review the notices supplied by your pilot coordinator before accepting these exact versions.',
              '請先閱讀試行計劃協調員提供的通知，再同意以下確切版本。')}</p>
            <dl>
              <dt>{t('Participation notice version and SHA-256', '參與通知版本及 SHA-256')}</dt>
              <dd><span>{run.participationNoticeVersion}</span><br/><code>{run.participationNoticeDigest}</code></dd>
              <dt>{t('Privacy notice version and SHA-256', '私隱通知版本及 SHA-256')}</dt>
              <dd><span>{run.privacyNoticeVersion}</span><br/><code>{run.privacyNoticeDigest}</code></dd>
            </dl>
            <button className="k-btn primary" disabled={blocked} onClick={event => void send({
              type: 'acceptConsent', requestId: crypto.randomUUID(),
              noticeVersion: run.participationNoticeVersion!, noticeDigest: run.participationNoticeDigest!,
              privacyNoticeVersion: run.privacyNoticeVersion!, privacyNoticeDigest: run.privacyNoticeDigest!,
            }, event.currentTarget)}>{t('Accept these notices', '同意這些通知')}</button>
          </section>}
        {participant?.consentDigest && <p>{t('Accepted consent digest:', '已同意的通知摘要碼：')} <code>{participant.consentDigest}</code></p>}
        {canWork && participant.role === 'creator' && (intake || snapshot?.contentConsent) &&
          <PilotContentIntakeForm key={JSON.stringify([run?.id, participant.id, intake?.id, intake?.revision, intake?.status, snapshot?.contentConsent])}
            intake={intake} consent={snapshot?.contentConsent} disabled={blocked} send={send}/>}
        {canWork && <nav aria-label={t('Pilot tasks', '試行計劃任務')}>
          <ul>
            {(roleLink ?? step.href) && <li><Link href={local((roleLink ?? step.href)!)}>
              {participant.role === 'creator' ? t('Open Creator Studio', '開啟創作者工作室')
                : participant.role === 'merchant' ? t('Open merchant workspace', '開啟商戶工作區') : t('Open trips', '開啟行程')}
            </Link></li>}
            <li><Link href={href('support')}>{t('Open support', '開啟支援')}</Link></li>
          </ul>
        </nav>}
        {participant && !step && !claimable && <p>{t('There is no pilot task available right now.', '目前沒有可用的試行計劃任務。')}</p>}
      </>}
    {enabled && actorId && !invalid && <>
      {busy && <p role="status">{t('Saving…', '正在儲存…')}</p>}
      {unknown && <><p role="alert">{t('The outcome is unknown. Retry the same request to check it.', '結果未明。請重試相同請求以確認結果。')}</p>
        <button ref={retry} type="button" className="k-btn primary" onClick={event => void send(undefined, event.currentTarget)}>
          {t('Retry same request', '重試相同請求')}</button></>}
      {!busy && !unknown && (snapshot || readFailed || accessLost) && <button type="button" className="k-btn" onClick={refreshView}>
        {t('Refresh pilot', '重新載入試行計劃')}</button>}
      <p role="status">{feedback}</p>
    </>}
  </section>;
}
