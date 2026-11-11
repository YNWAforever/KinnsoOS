'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatMoneyMinor, formatPaymentDeadline } from '../../lib/payments/format';
import { useApp } from './ui';

type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'completed'
  | 'awaiting_payment'
  | 'paid'
  | 'payment_expired'
  | 'refunded';

type Item = {
  id: string;
  guideId: string;
  guideTitle: string;
  creatorName: string;
  startsOn: string;
  endsOn: string | null;
  partySize: number;
  message: string;
  status: BookingStatus;
  responseNote: string | null;
  createdAt: string;
  paymentId: string | null;
  paymentStatus: string | null;
  amountMinor: number | null;
  currency: string | null;
  deadlineAt: string | null;
  paymentsEnabled: boolean;
};

const LABEL: Record<BookingStatus, [string, string]> = {
  requested: ['Waiting for the creator', '等待創作者回覆'],
  accepted: ['Accepted — arrange details', '已接受 — 請安排細節'],
  declined: ['Declined', '已婉拒'],
  withdrawn: ['Withdrawn', '已撤回'],
  completed: ['Completed', '已完成'],
  awaiting_payment: ['Accepted — payment due', '已接受 — 待付款'],
  paid: ['Paid — confirmed', '已付款 — 已確認'],
  payment_expired: ['Payment window closed', '付款期限已過'],
  refunded: ['Refunded', '已退款'],
};

type Upcoming = {
  id: string;
  guideTitle: string;
  startsOn: string;
  endsOn: string | null;
  partySize: number;
  daysUntil: number;
};

/** One place to track every date request a traveller has made. */
export function MyBookingRequests() {
  const { t, href, locale } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [authRequired, setAuthRequired] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'history'>('all');
  const active = (items ?? []).filter((item) => item.status === 'requested' || item.status === 'awaiting_payment');
  const history = (items ?? []).filter((item) => item.status !== 'requested' && item.status !== 'awaiting_payment');
  const filtered = filter === 'all' ? (items ?? []) : filter === 'active' ? active : history;
  const FILTERS: Array<['all' | 'active' | 'history', string, string, number]> = [
    ['all', 'All', '全部', items?.length ?? 0],
    ['active', 'Needs attention', '需要處理', active.length],
    ['history', 'Decided', '已有結果', history.length],
  ];

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/booking-requests', { cache: 'no-store' });
      if (response.status === 401) { setAuthRequired(true); setState('ready'); return; }
      if (!response.ok) { setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.items)) { setState('error'); return; }
      setItems(payload.data.items);
      setHasMore(payload.data.hasMore === true);
      setCursor(typeof payload.data.nextCursor === 'string' ? payload.data.nextCursor : null);
      setAuthRequired(false);
      setState('ready');
      const ahead = await fetch('/api/booking-requests/upcoming', { cache: 'no-store' });
      if (ahead.ok) {
        const aheadPayload = await ahead.json().catch(() => null);
        if (Array.isArray(aheadPayload?.data?.items)) setUpcoming(aheadPayload.data.items);
      }
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') === '1') setNotice(locale === 'zh-HK' ? '已收到付款，旅程已確認。' : 'Payment received — your trip is confirmed.');
    else if (params.get('pay_error')) setNotice(locale === 'zh-HK' ? '付款未能完成，請再試一次。' : 'The payment could not be completed. Try again.');
  }, [locale]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/booking-requests?cursor=${encodeURIComponent(cursor ?? '')}`, { cache: 'no-store' });
      const payload = response.ok ? await response.json().catch(() => null) : null;
      if (Array.isArray(payload?.data?.items)) {
        setItems((current) => [...(current ?? []), ...payload.data.items]);
        setHasMore(payload.data.hasMore === true);
        setCursor(typeof payload.data.nextCursor === 'string' ? payload.data.nextCursor : null);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const withdraw = async (id: string) => {
    setBusy(id); setNotice(null);
    try {
      const response = await fetch(`/api/booking-requests/${id}`, { method: 'PATCH' });
      setNotice(response.ok ? t('Request withdrawn.', '申請已撤回。') : t('The request could not be withdrawn.', '申請未能撤回。'));
      await load();
    } catch {
      setNotice(t('The request could not be withdrawn.', '申請未能撤回。'));
    } finally {
      setBusy(null);
    }
  };

  const pay = async (item: Item) => {
    setBusy(item.id); setNotice(null);
    try {
      const response = await fetch(`/api/booking-requests/${item.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const payload = response.ok ? await response.json().catch(() => null) : null;
      const url = payload?.data?.url;
      if (typeof url === 'string' && /^(https?:\/\/|\/)/.test(url)) { window.location.assign(url); return; }
      if (response.status === 403) setNotice(t('Payments are not available right now.', '付款功能暫未開放。'));
      else if (response.status === 409) setNotice(t('This payment can no longer be completed. Check the status below.', '此付款已無法完成，請查看下方狀態。'));
      else setNotice(t('Checkout could not be started.', '未能開始付款。'));
      await load();
    } catch {
      setNotice(t('Checkout could not be started.', '未能開始付款。'));
    } finally {
      setBusy(null);
    }
  };

  if (authRequired) {
    return (
      <section className="k-page" data-testid="my-booking-requests">
        <h1>{t('Your booking requests', '你的預訂申請')}</h1>
        <p><a className="k-btn" href={href('sign-in') + '?next=' + encodeURIComponent('/requests')}>{t('Sign in to see your requests', '登入後查看你的申請')}</a></p>
      </section>
    );
  }

  return (
    <section className="k-page" data-testid="my-booking-requests">
      <h1>{t('Your booking requests', '你的預訂申請')}</h1>
      <p>{t('Requests are not bookings: a date is confirmed when the creator accepts, and a priced guide is confirmed once payment completes.', '申請不是預訂：創作者接受後才確認日期；已定價的攻略需完成付款後才正式確認。')}</p>
      {upcoming.length > 0 && (
        <section className="k-card" data-testid="my-upcoming-bookings" aria-labelledby="my-upcoming-title" style={{ marginBottom: '12px' }}>
          <h2 id="my-upcoming-title" style={{ marginTop: 0 }}>{t('Starting soon', '即將出發')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
            {upcoming.map((trip) => (
              <li key={trip.id} data-testid="my-upcoming-trip" data-days-until={trip.daysUntil} style={{ borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '8px' }}>
                <strong>{trip.guideTitle}</strong> · {trip.startsOn}{trip.endsOn ? ` – ${trip.endsOn}` : ''} · {trip.partySize} {t('people', '人')}
                <span className="k-meta" style={{ marginLeft: '6px' }}>
                  {trip.daysUntil === 0 ? t('today', '今天') : `${trip.daysUntil} ${t('days to go', '天後')}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {state === 'loading' && <p role="status">{t('Loading your requests…', '正在載入申請…')}</p>}
      {state === 'error' && <p role="alert">{t('Your requests could not be loaded. Retry later.', '申請暫時未能載入，請稍後重試。')}</p>}
      {notice && <p role="status" data-testid="my-booking-notice">{notice}</p>}
      {state === 'ready' && items && items.length === 0 && (
        <p data-testid="my-booking-empty">{t('No requests yet.', '尚未有申請。')} <a href={href('explore')}>{t('Browse guides', '瀏覽攻略')}</a></p>
      )}
      {state === 'ready' && items && items.length > 0 && (
        <div role="group" aria-label={t('Filter requests', '篩選申請')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' }}>
          {FILTERS.map(([key, en, zh, count]) => (
            <button key={key} type="button" className={filter === key ? 'k-btn primary' : 'k-btn'} aria-pressed={filter === key} onClick={() => setFilter(key)} data-testid={`my-booking-filter-${key}`}>
              {t(en, zh)} ({count})
            </button>
          ))}
        </div>
      )}
      {state === 'ready' && items && items.length > 0 && filtered.length === 0 && (
        <p data-testid="my-booking-filter-empty">{t('No requests in this view.', '此篩選下沒有申請。')}</p>
      )}
      {state === 'ready' && filtered.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '10px' }}>
          {filtered.map((item) => (
            <li key={item.id} className="k-card" data-testid="my-booking-row" data-status={item.status}>
              <h2 style={{ marginTop: 0 }}><a href={href('g/' + item.guideId)}>{item.guideTitle}</a></h2>
              <p className="k-meta">{t('By', '作者')} {item.creatorName} · {item.startsOn}{item.endsOn ? ` – ${item.endsOn}` : ''} · {item.partySize} {t('people', '人')}</p>
              <p>{t(LABEL[item.status][0], LABEL[item.status][1])}</p>
              {item.responseNote && <p className="k-meta" data-testid="my-booking-response-note">{t('Creator note', '創作者備註')}: {item.responseNote}</p>}
              {item.status === 'awaiting_payment' && item.amountMinor != null && (
                <div className="k-card" data-testid="my-booking-payment" style={{ marginTop: '8px' }}>
                  <p className="k-meta">
                    {t('Amount due', '應付金額')}: <strong data-testid="my-booking-payment-amount">{formatMoneyMinor(item.amountMinor, item.currency ?? 'HKD')}</strong>
                    {item.deadlineAt ? ` · ${t('pay before', '請於此前付款')} ${formatPaymentDeadline(item.deadlineAt)}` : ''}
                  </p>
                  {item.paymentsEnabled ? (
                    <button type="button" className="k-btn primary" disabled={busy === item.id} onClick={() => void pay(item)} data-testid="my-booking-pay">
                      {busy === item.id ? t('Opening checkout…', '正在開啟付款…') : t(`Pay ${formatMoneyMinor(item.amountMinor, item.currency ?? 'HKD')}`, `付款 ${formatMoneyMinor(item.amountMinor, item.currency ?? 'HKD')}`)}
                    </button>
                  ) : (
                    <p role="status" data-testid="my-booking-payment-paused">{t('Payment is paused. Your request is still accepted.', '付款功能暫停，你的申請仍已接受。')}</p>
                  )}
                </div>
              )}
              {item.status === 'paid' && item.amountMinor != null && (
                <p className="k-meta" data-testid="my-booking-paid">{t('Paid', '已付款')}: {formatMoneyMinor(item.amountMinor, item.currency ?? 'HKD')}</p>
              )}
              {item.status === 'requested' && (
                <button type="button" className="k-btn" disabled={busy === item.id} onClick={() => void withdraw(item.id)} data-testid="my-booking-withdraw">
                  {busy === item.id ? t('Withdrawing…', '撤回中…') : t('Withdraw', '撤回')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" className="k-btn" disabled={loadingMore} onClick={() => void loadMore()} data-testid="my-booking-load-more" style={{ marginTop: '10px' }}>
          {loadingMore ? t('Loading…', '載入中…') : t('Load older requests', '載入更早的申請')}
        </button>
      )}
    </section>
  );
}
