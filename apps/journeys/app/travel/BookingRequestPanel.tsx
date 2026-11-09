'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type BookingRequest = {
  id: string;
  guideId: string;
  startsOn: string;
  endsOn: string | null;
  partySize: number;
  message: string;
  status: 'requested' | 'accepted' | 'declined' | 'withdrawn';
  createdAt: string;
};

const STATUS_LABEL: Record<BookingRequest['status'], [string, string]> = {
  requested: ['Requested', '已提出'],
  accepted: ['Creator accepted', '創作者已接受'],
  declined: ['Creator declined', '創作者已婉拒'],
  withdrawn: ['Withdrawn', '已撤回'],
};

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

/** Request-to-book a date with the guide's author. Request only: no payment, no
 * confirmation, and the creator's answer appears here — nothing is promised. */
export function BookingRequestPanel({ guideId }: { guideId: string }) {
  const app = useApp();
  // Server rendering in public-page tests can mount this without an AppContext; fall back safely.
  const t = (en: string, zh: string) => (app ? app.t(en, zh) : en);
  const href = (path: string) => (app ? app.href(path) : '/' + path);
  const [items, setItems] = useState<BookingRequest[] | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ startsOn: iso(7), endsOn: '', partySize: 2, note: '' });

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/booking-requests', { cache: 'no-store' });
      if (response.status === 401) { setAuthRequired(true); return; }
      if (!response.ok) { setError(t('Your booking requests could not be loaded.', '預訂申請暫時未能載入。')); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.items)) { setError(t('Your booking requests could not be loaded.', '預訂申請暫時未能載入。')); return; }
      setItems(payload.data.items.filter((item: BookingRequest) => item.guideId === guideId));
      setAuthRequired(false);
    } catch {
      setError(t('Your booking requests could not be loaded.', '預訂申請暫時未能載入。'));
    }
  }, [guideId, t]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    setBusy(true); setMessage(null); setError(null);
    try {
      const response = await fetch('/api/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guideId,
          startsOn: form.startsOn,
          endsOn: form.endsOn || null,
          partySize: Number(form.partySize),
          message: form.note,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 201) {
        setMessage(t('Request sent. The creator decides; this is not a confirmed booking.', '申請已送出，由創作者決定；這不是已確認的預訂。'));
        await load();
      } else if (response.status === 401) {
        setAuthRequired(true);
      } else if (response.status === 429) {
        setError(t('Too many requests in 24 hours. Try again tomorrow.', '24 小時內申請過多，請明天再試。'));
      } else if (response.status === 400) {
        setError(t('Check the dates, party size and message.', '請檢查日期、人數及訊息。'));
      } else {
        setError(t('The request could not be sent.', '申請未能送出。'));
      }
    } catch {
      setError(t('The request could not be sent.', '申請未能送出。'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    setBusy(true); setMessage(null); setError(null);
    try {
      const response = await fetch(`/api/booking-requests/${id}`, { method: 'PATCH' });
      if (!response.ok) setError(t('The request could not be withdrawn.', '申請未能撤回。'));
      else setMessage(t('Request withdrawn.', '申請已撤回。'));
      await load();
    } catch {
      setError(t('The request could not be withdrawn.', '申請未能撤回。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="k-card" aria-labelledby="booking-request-title" data-testid="booking-request-panel">
      <h2 id="booking-request-title" style={{ marginTop: 0 }}>{t('Request a date with the author', '向作者預約日期')}</h2>
      <p className="k-meta">{t('This sends a request only. No payment is taken and nothing is confirmed until the creator accepts. The product does not collect contact details, so include a way to reach you in the message if you want the creator to follow up.', '這只會送出申請；不收取款項，創作者接受前都不算確認。此產品不會收集聯絡資料，如希望創作者跟進，請在訊息中留下聯絡方式。')}</p>
      {authRequired ? (
        <p>
          <a className="k-btn" href={href('sign-in') + '?next=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}>
            {t('Sign in to request a date', '登入後提出預約')}
          </a>
        </p>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} style={{ display: 'grid', gap: '8px', maxWidth: '32rem' }}>
          <label style={{ display: 'grid', gap: '4px' }}>{t('Preferred start date', '希望開始日期')}
            <input type="date" required min={iso(0)} value={form.startsOn} onChange={(event) => setForm((f) => ({ ...f, startsOn: event.target.value }))} data-testid="booking-request-start" />
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>{t('End date (optional)', '結束日期（可選）')}
            <input type="date" min={form.startsOn} value={form.endsOn} onChange={(event) => setForm((f) => ({ ...f, endsOn: event.target.value }))} data-testid="booking-request-end" />
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>{t('Party size', '人數')}
            <select value={form.partySize} onChange={(event) => setForm((f) => ({ ...f, partySize: Number(event.target.value) }))} style={{ maxWidth: '10rem' }} data-testid="booking-request-party">
              {Array.from({ length: 10 }, (_, index) => index + 1).map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>{t('Message to the author (optional)', '給作者的訊息（可選）')}
            <textarea rows={3} maxLength={1000} value={form.note} onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))} data-testid="booking-request-note" />
          </label>
          <button type="submit" className="k-btn primary" disabled={busy} style={{ justifySelf: 'start' }} data-testid="booking-request-submit">
            {busy ? t('Sending…', '送出中…') : t('Send request', '送出申請')}
          </button>
        </form>
      )}
      {message && <p role="status" data-testid="booking-request-message">{message}</p>}
      {error && <p role="alert" data-testid="booking-request-error">{error}</p>}
      {items && items.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <h3>{t('Your requests for this guide', '你對此攻略的申請')}</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
            {items.map((item) => (
              <li key={item.id} data-testid="booking-request-row" data-status={item.status} style={{ borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '8px' }}>
                <strong>{item.startsOn}{item.endsOn ? ` – ${item.endsOn}` : ''}</strong> · {item.partySize} {t('people', '人')} · {t(STATUS_LABEL[item.status][0], STATUS_LABEL[item.status][1])}
                {item.status === 'requested' && (
                  <button type="button" className="k-btn" style={{ marginLeft: '8px' }} disabled={busy} onClick={() => void withdraw(item.id)} data-testid="booking-request-withdraw">
                    {t('Withdraw', '撤回')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
