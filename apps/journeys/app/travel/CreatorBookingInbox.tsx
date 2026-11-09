'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Item = {
  id: string;
  guideId: string;
  guideTitle: string;
  startsOn: string;
  endsOn: string | null;
  partySize: number;
  message: string;
  status: 'requested' | 'accepted' | 'declined' | 'withdrawn';
  createdAt: string;
};

const LABEL: Record<Item['status'], [string, string]> = {
  requested: ['Requested', '待回覆'],
  accepted: ['Accepted', '已接受'],
  declined: ['Declined', '已婉拒'],
  withdrawn: ['Withdrawn', '已撤回'],
};

/** Creator inbox for request-to-book inquiries. Request only; no payment, no traveller contact details. */
export function CreatorBookingInbox() {
  const { t } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/creator/booking-requests', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { setState('hidden'); return; }
      if (!response.ok) { setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.items)) { setState('error'); return; }
      setItems(payload.data.items);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const respond = async (id: string, action: 'accepted' | 'declined') => {
    setBusy(id); setNotice(null);
    try {
      const response = await fetch('/api/creator/booking-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: action }),
      });
      if (response.ok) {
        setNotice(action === 'accepted' ? t('Request accepted.', '已接受申請。') : t('Request declined.', '已婉拒申請。'));
      } else if (response.status === 409) {
        setNotice(t('That request was already decided.', '該申請已有決定。'));
      } else {
        setNotice(t('The response could not be saved.', '回覆未能儲存。'));
      }
      await load();
    } catch {
      setNotice(t('The response could not be saved.', '回覆未能儲存。'));
    } finally {
      setBusy(null);
    }
  };

  if (state === 'hidden') return null;
  if (state === 'loading') return <section className="k-card" aria-busy="true"><p role="status">{t('Loading booking requests…', '正在載入預訂申請…')}</p></section>;
  if (state === 'error' || !items) {
    return (
      <section className="k-card" data-testid="creator-booking-inbox" data-state="error">
        <p role="alert">{t('Booking requests could not be loaded. Retry later.', '預訂申請暫時未能載入，請稍後重試。')}</p>
        <button type="button" className="k-btn" onClick={() => void load()}>{t('Retry', '重試')}</button>
      </section>
    );
  }

  return (
    <section className="k-card" aria-labelledby="creator-booking-title" data-testid="creator-booking-inbox" data-state="ready">
      <h2 id="creator-booking-title" style={{ marginTop: 0 }}>{t('Booking requests', '預訂申請')}</h2>
      <p className="k-meta">{t('Travelers can request a date with you. Accepting means you will arrange it directly; no payment is processed here and no contact details are shared.', '旅客可向你提出日期申請。接受代表你會直接安排；此處不處理付款，亦不交換聯絡資料。')}</p>
      {notice && <p role="status" data-testid="creator-booking-notice">{notice}</p>}
      {items.length === 0 ? (
        <p data-testid="creator-booking-empty">{t('No requests yet.', '尚未有申請。')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '10px' }}>
          {items.map((item) => (
            <li key={item.id} data-testid="creator-booking-row" data-status={item.status} style={{ borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '10px' }}>
              <strong>{item.guideTitle}</strong> · {item.startsOn}{item.endsOn ? ` – ${item.endsOn}` : ''} · {item.partySize} {t('people', '人')} · {t(LABEL[item.status][0], LABEL[item.status][1])}
              {item.message && <span className="k-meta" style={{ display: 'block', overflowWrap: 'anywhere' }}>{item.message}</span>}
              {item.status === 'requested' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button type="button" className="k-btn primary" disabled={busy === item.id} onClick={() => void respond(item.id, 'accepted')} data-testid="creator-booking-accept">
                    {busy === item.id ? t('Saving…', '儲存中…') : t('Accept', '接受')}
                  </button>
                  <button type="button" className="k-btn" disabled={busy === item.id} onClick={() => void respond(item.id, 'declined')} data-testid="creator-booking-decline">
                    {t('Decline', '婉拒')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
