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
  responseNote: string | null;
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | Item['status']>('all');
  const counts = {
    all: items?.length ?? 0,
    requested: items?.filter((item) => item.status === 'requested').length ?? 0,
    accepted: items?.filter((item) => item.status === 'accepted').length ?? 0,
    declined: items?.filter((item) => item.status === 'declined').length ?? 0,
    withdrawn: items?.filter((item) => item.status === 'withdrawn').length ?? 0,
  };
  const filtered = (items ?? []).filter((item) => filter === 'all' || item.status === filter);
  const FILTERS: Array<['all' | Item['status'], string, string]> = [
    ['all', 'All', '全部'],
    ['requested', 'Pending', '待回覆'],
    ['accepted', 'Accepted', '已接受'],
    ['declined', 'Declined', '已婉拒'],
    ['withdrawn', 'Withdrawn', '已撤回'],
  ];

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/creator/booking-requests', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { setState('hidden'); return; }
      if (!response.ok) { setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.items)) { setState('error'); return; }
      setItems(payload.data.items);
      setHasMore(payload.data.hasMore === true);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/creator/booking-requests?offset=${items?.length ?? 0}`, { cache: 'no-store' });
      const payload = response.ok ? await response.json().catch(() => null) : null;
      if (Array.isArray(payload?.data?.items)) {
        setItems((current) => [...(current ?? []), ...payload.data.items]);
        setHasMore(payload.data.hasMore === true);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const respond = async (id: string, action: 'accepted' | 'declined') => {
    setBusy(id); setNotice(null);
    try {
      const response = await fetch('/api/creator/booking-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: action, note: notes[id] ?? '' }),
      });
      if (response.ok) {
        setNotice(action === 'accepted' ? t('Request accepted.', '已接受申請。') : t('Request declined.', '已婉拒申請。'));
      } else if (response.status === 409) {
        setNotice(t('That request was already decided.', '該申請已有決定。'));
      } else {
        setNotice(t('The response could not be saved.', '回覆未能儲存。'));
      }
      setNotes((current) => { const next = { ...current }; delete next[id]; return next; });
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
      <p className="k-meta">{t('Travelers can request a date with you. The product takes no payment and does not collect contact details; if the traveller left a way to reach them in the message, arrange the details directly.', '旅客可向你提出日期申請。此處不處理付款，也不會收集聯絡資料；若旅客在訊息中留下聯絡方式，請直接安排細節。')}</p>
      {notice && <p role="status" data-testid="creator-booking-notice">{notice}</p>}
      {items.length > 0 && (
        <div role="group" aria-label={t('Filter requests', '篩選申請')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' }}>
          {FILTERS.map(([key, en, zh]) => (
            <button key={key} type="button" className={filter === key ? 'k-btn primary' : 'k-btn'} aria-pressed={filter === key} onClick={() => setFilter(key)} data-testid={`creator-booking-filter-${key}`}>
              {t(en, zh)} ({counts[key]})
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <p data-testid="creator-booking-empty">{t('No requests yet.', '尚未有申請。')}</p>
      ) : filtered.length === 0 ? (
        <p data-testid="creator-booking-filter-empty">{t('No requests in this view.', '此篩選下沒有申請。')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '10px' }}>
          {filtered.map((item) => (
            <li key={item.id} data-testid="creator-booking-row" data-status={item.status} style={{ borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '10px' }}>
              <strong>{item.guideTitle}</strong> · {item.startsOn}{item.endsOn ? ` – ${item.endsOn}` : ''} · {item.partySize} {t('people', '人')} · {t(LABEL[item.status][0], LABEL[item.status][1])}
              {item.message && <span className="k-meta" style={{ display: 'block', overflowWrap: 'anywhere' }}>{item.message}</span>}
              {item.responseNote && <span className="k-meta" style={{ display: 'block' }} data-testid="creator-booking-response-note">{t('Your note', '你的備註')}: {item.responseNote}</span>}
              {item.status === 'requested' && (
                <div style={{ display: 'grid', gap: '6px', marginTop: '6px' }}>
                  <label style={{ display: 'grid', gap: '4px' }}>{t('Optional note to the traveller', '給旅客的備註（可選）')}
                    <textarea maxLength={500} rows={2} value={notes[item.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} data-testid="creator-booking-note" />
                  </label>
                  <button type="button" className="k-btn primary" disabled={busy === item.id} onClick={() => void respond(item.id, 'accepted')} data-testid="creator-booking-accept">
                    {busy === item.id ? t('Saving…', '儲存中…') : t('Accept', '接受')}
                  </button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="k-btn" disabled={busy === item.id} onClick={() => void respond(item.id, 'declined')} data-testid="creator-booking-decline">
                    {t('Decline', '婉拒')}
                  </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" className="k-btn" disabled={loadingMore} onClick={() => void loadMore()} data-testid="creator-booking-load-more" style={{ marginTop: '10px' }}>
          {loadingMore ? t('Loading…', '載入中…') : t('Load older requests', '載入更早的申請')}
        </button>
      )}
    </section>
  );
}
