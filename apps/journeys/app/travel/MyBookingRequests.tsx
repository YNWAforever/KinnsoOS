'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Item = {
  id: string;
  guideId: string;
  guideTitle: string;
  creatorName: string;
  startsOn: string;
  endsOn: string | null;
  partySize: number;
  message: string;
  status: 'requested' | 'accepted' | 'declined' | 'withdrawn';
  responseNote: string | null;
  createdAt: string;
};

const LABEL: Record<Item['status'], [string, string]> = {
  requested: ['Waiting for the creator', '等待創作者回覆'],
  accepted: ['Accepted — arrange details', '已接受 — 請安排細節'],
  declined: ['Declined', '已婉拒'],
  withdrawn: ['Withdrawn', '已撤回'],
};

/** One place to track every date request a traveller has made. */
export function MyBookingRequests() {
  const { t, href } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/booking-requests', { cache: 'no-store' });
      if (response.status === 401) { setAuthRequired(true); setState('ready'); return; }
      if (!response.ok) { setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.items)) { setState('error'); return; }
      setItems(payload.data.items);
      setAuthRequired(false);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
      <p>{t('Requests are not bookings: a date is confirmed only when the creator accepts, and no payment happens here.', '申請不是預訂：只有創作者接受後才算確認日期，此處不涉及付款。')}</p>
      {state === 'loading' && <p role="status">{t('Loading your requests…', '正在載入申請…')}</p>}
      {state === 'error' && <p role="alert">{t('Your requests could not be loaded. Retry later.', '申請暫時未能載入，請稍後重試。')}</p>}
      {notice && <p role="status" data-testid="my-booking-notice">{notice}</p>}
      {state === 'ready' && items && items.length === 0 && (
        <p data-testid="my-booking-empty">{t('No requests yet.', '尚未有申請。')} <a href={href('explore')}>{t('Browse guides', '瀏覽攻略')}</a></p>
      )}
      {state === 'ready' && items && items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '10px' }}>
          {items.map((item) => (
            <li key={item.id} className="k-card" data-testid="my-booking-row" data-status={item.status}>
              <h2 style={{ marginTop: 0 }}><a href={href('g/' + item.guideId)}>{item.guideTitle}</a></h2>
              <p className="k-meta">{t('By', '作者')} {item.creatorName} · {item.startsOn}{item.endsOn ? ` – ${item.endsOn}` : ''} · {item.partySize} {t('people', '人')}</p>
              <p>{t(LABEL[item.status][0], LABEL[item.status][1])}</p>
              {item.responseNote && <p className="k-meta" data-testid="my-booking-response-note">{t('Creator note', '創作者備註')}: {item.responseNote}</p>}
              {item.status === 'requested' && (
                <button type="button" className="k-btn" disabled={busy === item.id} onClick={() => void withdraw(item.id)} data-testid="my-booking-withdraw">
                  {busy === item.id ? t('Withdrawing…', '撤回中…') : t('Withdraw', '撤回')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
