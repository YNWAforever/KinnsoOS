'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { subscribeAccountInvalidation } from '../../lib/trips/local-drafts';
import { formatMoneyMinor, formatPaymentDeadline } from '../../lib/payments/format';
import { Modal, useApp } from './ui';

type PaymentRow = {
  paymentId: string; bookingRequestId: string; status: string; amountMinor: number; currency: string;
  provider: string; providerRefundId: string | null; guideTitle: string | null; startsOn: string | null; endsOn: string | null; partySize: number | null;
  createdAt: string; deadlineAt: string; processingAt: string | null; paidAt: string | null; refundedAt: string | null;
  providerEventCount: number; lastEventKind: string | null; lastIgnoredReason: string | null; lastEventAt: string | null;
};
type WebhookEvent = {
  eventId: string; kind: string; eventType: string | null; provider: string | null; ignored: string | null;
  late: boolean | null; amountTotal: string | null; currency: string | null; paymentId: string | null;
  bookingRequestId: string | null; paymentStatus: string | null; createdAt: string;
};
type Summary = {
  enabled: boolean; provider: string; providerConfigured: boolean; webhookConfigured: boolean; pricedGuides: number; requiresPayment: number;
  processing: number; paid: number; refunded: number; expired: number; providerEvents: number; overdueCheckouts: number;
  payments: { items: PaymentRow[]; hasMore: boolean };
  webhookEvents: { items: WebhookEvent[]; counts: Record<string, number>; total: number };
};
type Detail = { payment: Record<string, unknown>; booking: Record<string, unknown>; events: Record<string, unknown>[] };
const STATUS_LABEL: Record<string, [string, string]> = {
  requires_payment: ['Payment due', '待付款'],
  processing: ['Checkout open', '付款處理中'],
  paid: ['Paid', '已付款'],
  refunded: ['Refunded', '已退款'],
  expired: ['Expired', '已過期'],
  failed: ['Failed', '付款失敗'],
};

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function errorLabel(code: string, t: (en: string, zh: string) => string) {
  if (code === 'FORBIDDEN' || code === 'AUTH_REQUIRED') return t('Active operations access is required.', '需要有效的營運存取權。');
  if (code === 'INVALID' || code === 'INVALID_REASON') return t('The refund reason must be between 5 and 500 characters.', '退款原因須為 5 至 500 字。');
  if (code === 'CONFLICT' || code === 'PAYMENT_NOT_REFUNDABLE') return t('This payment can no longer be refunded.', '此付款已無法退款。');
  if (code === 'NOT_FOUND') return t('The payment was not found.', '找不到此付款。');
  return t('The payments dashboard could not be loaded. Refresh or retry.', '未能載入付款資訊，請重新整理或重試。');
}

export function OpsPaymentsWorkspace({ actorId, enabled }: { actorId: string | null; enabled: boolean }) {
  const { locale, t, href } = useApp();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [valid, setValid] = useState(true);
  const [refund, setRefund] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState('');
  const [refundError, setRefundError] = useState('');
  const [refundMessage, setRefundMessage] = useState('');
  const [sweepMessage, setSweepMessage] = useState('');
  const [detail, setDetail] = useState<{ id: string; data: Detail } | null>(null);
  const generation = useRef(0);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setValid(true);
    const unsubscribe = subscribeAccountInvalidation((next) => {
      if (next !== actorId) { generation.current++; setValid(false); setData(null); setError(''); }
    });
    return () => { generation.current++; unsubscribe(); };
  }, [actorId]);

  async function load() {
    if (!actorId || !enabled) return;
    const own = ++generation.current;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/ops/payments', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (own !== generation.current) return;
      if (!response.ok || !payload?.ok) throw new Error(payload?.code ?? 'UNAVAILABLE');
      setData(payload.data as Summary);
    } catch (next) {
      if (own === generation.current) setError(errorLabel(next instanceof Error ? next.message : '', t));
    } finally {
      if (own === generation.current) setBusy(false);
    }
  }
  useEffect(() => { void load(); }, [actorId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sweep() {
    if (busy) return;
    setBusy(true); setError(''); setSweepMessage('');
    try {
      const response = await fetch('/api/ops/payments/sweep', { method: 'POST', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.code ?? 'UNAVAILABLE');
      const expired = Number(payload.data?.expired ?? 0);
      const reminded = Number(payload.data?.reminded ?? 0);
      setSweepMessage(t(`Expired ${expired} window(s), reminded ${reminded} traveller(s).`, `已清掃 ${expired} 個到期付款，提醒 ${reminded} 位旅客。`));
      await load();
    } catch (next) {
      setError(errorLabel(next instanceof Error ? next.message : '', t));
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (!data || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/ops/payments', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !data.enabled }), cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.code ?? 'UNAVAILABLE');
      await load();
    } catch (next) {
      setError(errorLabel(next instanceof Error ? next.message : '', t));
      setBusy(false);
    }
  }

  async function openDetail(paymentId: string) {
    if (detail?.id === paymentId) { setDetail(null); return; }
    const own = ++generation.current;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ops/payments?paymentId=${encodeURIComponent(paymentId)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (own !== generation.current) return;
      if (!response.ok || !payload?.ok) throw new Error(payload?.code ?? 'UNAVAILABLE');
      setDetail({ id: paymentId, data: payload.data as Detail });
    } catch (next) {
      if (own === generation.current) setError(errorLabel(next instanceof Error ? next.message : '', t));
    } finally {
      if (own === generation.current) setBusy(false);
    }
  }

  function openRefund(entry: PaymentRow, element: HTMLElement) {
    opener.current = element;
    setReason(''); setRefundError(''); setRefundMessage('');
    setRefund(entry);
  }

  async function confirmRefund() {
    if (!refund || busy || reason.trim().length < 5) return;
    setBusy(true); setRefundError('');
    try {
      const response = await fetch('/api/ops/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: refund.paymentId, reason: reason.trim() }), cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.code ?? 'UNAVAILABLE');
      const amount = formatMoneyMinor(refund.amountMinor, refund.currency);
      setRefundMessage(t(`Refund recorded for ${amount}.`, `已記錄 ${amount} 退款。`));
      setRefund(null);
      await load();
      if (detail?.id === refund.paymentId) await openDetail(refund.paymentId);
    } catch (next) {
      setRefundError(errorLabel(next instanceof Error ? next.message : '', t));
    } finally {
      setBusy(false);
    }
  }

  const title = t('Payments', '付款');
  if (!enabled || !actorId || !valid) {
    return <section className="k-page"><h1>{title}</h1><p role="status">{t('Sign in with an active operations account to view payments.', '請以有效的營運帳戶登入以查看付款。')}</p></section>;
  }
  const items = data?.payments?.items ?? [];
  const events = data?.webhookEvents?.items ?? [];
  const counts = data?.webhookEvents?.counts ?? {};
  return <section className="k-page" data-testid="ops-payments">
    <div className="k-page-heading"><div><p className="k-eyebrow">{t('KINNSO OPERATIONS','KINNSO 營運')}</p><h1>{title}</h1></div><Link className="k-btn" href={href('ops')}>{t('Review queue','審核待辦')}</Link></div>
    <nav className="k-nav-chips" aria-label={t('Operations sections','營運功能')}>
      <Link href={href('ops?view=overview')}>{t('Overview','總覽')}</Link>
      <Link className="active" href={href('ops?view=payments')}>{t('Payments','付款')}</Link>
      <Link href={href('ops?view=creators')}>{t('Creators','創作者')}</Link>
    </nav>
    {error && <p role="alert" data-testid="ops-payments-error">{error}</p>}
    {!data && !error && <p role="status">{t('Loading payments…','正在載入付款資訊…')}</p>}
    {data && <div className="k-card" data-testid="ops-payments-summary">
      <h2>{t('Money states','金額狀態')}</h2>
      <p className="k-meta">{t('Payments are ','付款功能') + (data.enabled ? t('enabled','已啟用') : t('disabled','已停用')) + ' · ' + t('provider: ','服務商：') + data.provider + (data.providerConfigured ? '' : ' (' + t('not configured','未設定') + ')')}</p>
      <p className="k-meta" data-testid="ops-webhook-config">{t('Webhook secret: ','Webhook 密鑰：') + (data.webhookConfigured ? t('configured','已設定') : t('missing','未設定'))}</p>
      <dl>
        <div><dt>{t('Paid','已付款')}</dt><dd data-testid="ops-count-paid">{data.paid}</dd></div>
        <div><dt>{t('Payment due','待付款')}</dt><dd data-testid="ops-count-requires">{data.requiresPayment}</dd></div>
        <div><dt>{t('Checkout open','付款處理中')}</dt><dd data-testid="ops-count-processing">{data.processing}</dd></div>
        <div><dt>{t('Refunded','已退款')}</dt><dd data-testid="ops-count-refunded">{data.refunded}</dd></div>
        <div><dt>{t('Expired','已過期')}</dt><dd data-testid="ops-count-expired">{data.expired}</dd></div>
        <div><dt>{t('Provider events','服務商事件')}</dt><dd data-testid="ops-count-events">{data.providerEvents}</dd></div>
        <div><dt>{t('Overdue checkouts','逾期付款')}</dt><dd data-testid="ops-count-overdue">{data.overdueCheckouts}</dd></div>
        <div><dt>{t('Priced guides','已定價攻略')}</dt><dd>{data.pricedGuides}</dd></div>
      </dl>
      <button className="k-btn" data-testid="ops-payments-toggle" disabled={busy} onClick={() => void toggle()}>{data.enabled ? t('Pause payments','暫停付款') : t('Enable payments','啟用付款')}</button>
      <button className="k-btn" data-testid="ops-sweep-expired" disabled={busy} onClick={() => void sweep()}>{t('Run payment window checks','檢查付款期限')}</button>
      {sweepMessage && <p role="status" data-testid="ops-sweep-result">{sweepMessage}</p>}
      {refundMessage && <p role="status" data-testid="ops-refund-success">{refundMessage}</p>}
    </div>}
    {data && <div className="k-card-list" data-testid="ops-payment-list">
      <h2>{t('Recent payments','最近付款')}</h2>
      {items.length === 0 && <p>{t('No payments yet.','尚未有付款。')}</p>}
      {items.map((entry) => {
        const label = STATUS_LABEL[entry.status] ?? [entry.status, entry.status];
        return <article className="k-card" key={entry.paymentId} data-testid="ops-payment-row" data-status={entry.status}>
          <h3 data-testid="ops-payment-amount">{formatMoneyMinor(entry.amountMinor, entry.currency)} · {entry.guideTitle ?? t('Guide','攻略')}</h3>
          <p data-testid="ops-payment-status">{locale === 'zh-HK' ? label[1] : label[0]}</p>
          <p className="k-meta">{t('Starts','出發')} {entry.startsOn ?? '—'} · {t('Deadline','期限')} {formatPaymentDeadline(entry.deadlineAt) || '—'} · {t('Provider','服務商')} {entry.provider}</p>
          {entry.paidAt && <p className="k-meta">{t('Paid at','付款時間')} {formatPaymentDeadline(entry.paidAt)}</p>}
          {entry.refundedAt && <p className="k-meta">{t('Refunded at','退款時間')} {formatPaymentDeadline(entry.refundedAt)}</p>}
          {entry.lastIgnoredReason && <p role="alert" data-testid="ops-payment-warning">{t('Latest provider event was not applied: ','最新的服務商事件未套用：')}{entry.lastIgnoredReason}</p>}
          <button className="k-btn" data-testid="ops-payment-detail-toggle" disabled={busy} onClick={() => void openDetail(entry.paymentId)}>{t('Audit trail','審核紀錄')}</button>
          {entry.status === 'paid' && entry.provider === 'fake' && <button className="k-btn primary" data-testid="ops-payment-refund" disabled={busy} onClick={(event) => openRefund(entry, event.currentTarget)}>{t('Refund','退款')}</button>}
          {detail?.id === entry.paymentId && <div data-testid="ops-payment-detail">
            {detail.data.events.length === 0 && <p>{t('No ledger events.','尚無帳本事件。')}</p>}
            <ul>{detail.data.events.map((event, index) => <li key={String(event.providerEventId ?? index)} data-testid="ops-payment-event">
              {text(event.kind)}{event.ignored ? ' · ' + t('ignored','未套用') + ': ' + text(event.ignored) : ''}{event.reason ? ' · ' + t('reason','原因') + ': ' + text(event.reason) : ''}{event.providerRefundId ? ' · ' + t('provider refund','服務商退款') + ': ' + text(event.providerRefundId) : ''}{event.actorId ? ' · ' + t('actor','操作人') + ': ' + String(text(event.actorId)).slice(0, 8) : ''} · {formatPaymentDeadline(text(event.createdAt))}
            </li>)}</ul>
          </div>}
        </article>;
      })}
      {data.payments.hasMore && <p className="k-meta">{t('Showing the latest 100 payments.','顯示最近 100 筆付款。')}</p>}
    </div>}
    {data && <div className="k-card" data-testid="ops-webhook-events">
      <h2>{t('Provider webhook ledger','服務商 Webhook 帳本')}</h2>
      <p className="k-meta">{t('Total events: ','事件總數：')}{data.webhookEvents.total} · {Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(' · ') || t('none','無')}</p>
      {events.length === 0 && <p>{t('No provider events yet.','尚未有服務商事件。')}</p>}
      <ul>{events.map((event) => <li key={event.eventId} data-testid="ops-webhook-event">
        {event.eventType ?? event.kind} · {event.kind} · {event.provider ?? '—'}{event.ignored ? ' · ' + t('ignored','未套用') + ': ' + event.ignored : ' · ' + t('applied','已套用')}{event.amountTotal ? ' · ' + event.amountTotal + ' ' + (event.currency ?? '') : ''} · {formatPaymentDeadline(event.createdAt)}
      </li>)}</ul>
    </div>}
    {refund && <Modal title={t('Refund payment','退款')} returnFocus={opener.current} onClose={() => setRefund(null)}>
      <p>{formatMoneyMinor(refund.amountMinor, refund.currency)} · {refund.guideTitle ?? ''}</p>
      <p className="k-meta">{t('Test provider only; the trip moves to refunded.','僅限測試服務商；行程會移至已退款。')}</p>
      <label>{t('Refund reason','退款原因')}<textarea data-testid="ops-refund-reason" required maxLength={500} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      {refundError && <p role="alert" data-testid="ops-refund-error">{refundError}</p>}
      <button className="k-btn" disabled={busy} onClick={() => setRefund(null)}>{t('Cancel','取消')}</button>
      <button className="k-btn primary" data-testid="ops-refund-confirm" disabled={busy || reason.trim().length < 5} onClick={() => void confirmRefund()}>{t('Record refund','記錄退款')}</button>
    </Modal>}
  </section>;
}
