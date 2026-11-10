'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Range = { id: string; startsOn: string; endsOn: string };

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

/** Creator-owned blocked dates for request-to-book. Ops-only surfaces never see
 * this; travellers see the ranges on the guide page and the request is refused
 * server-side when it intersects one. */
export function AvailabilityPanel({ guideId }: { guideId: string }) {
  const { t } = useApp();
  const [ranges, setRanges] = useState<Range[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');
  const [form, setForm] = useState({ startsOn: iso(1), endsOn: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/creator/guides/${guideId}/unavailable`, { cache: 'no-store' });
      if (response.status === 401 || response.status === 403 || response.status === 404) { setState('hidden'); return; }
      if (!response.ok) { setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.ranges)) { setState('error'); return; }
      setRanges(payload.data.ranges);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [guideId]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/creator/guides/${guideId}/unavailable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsOn: form.startsOn, endsOn: form.endsOn || form.startsOn }),
      });
      if (response.status === 201) {
        setNotice(t('Dates blocked.', '已封鎖日期。'));
        setForm((current) => ({ ...current, endsOn: '' }));
        await load();
      } else if (response.status === 409) {
        setNotice(t('These dates overlap a range you already blocked.', '這些日期與已封鎖的範圍重疊。'));
      } else {
        setNotice(t('Those dates could not be blocked.', '未能封鎖這些日期。'));
      }
    } catch {
      setNotice(t('Those dates could not be blocked.', '未能封鎖這些日期。'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/creator/guides/${guideId}/unavailable/${id}`, { method: 'DELETE' });
      if (!response.ok) setNotice(t('That range could not be removed.', '未能移除該範圍。'));
      await load();
    } catch {
      setNotice(t('That range could not be removed.', '未能移除該範圍。'));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'hidden') return null;
  if (state === 'loading') return <section className="k-card" aria-busy="true"><p role="status">{t('Loading unavailable dates…', '正在載入不可預約日期…')}</p></section>;
  if (state === 'error' || !ranges) {
    return (
      <section className="k-card" data-testid="creator-availability" data-state="error">
        <p role="alert">{t('Unavailable dates could not be loaded. Retry later.', '不可預約日期暫時未能載入，請稍後重試。')}</p>
        <button type="button" className="k-btn" onClick={() => void load()}>{t('Retry', '重試')}</button>
      </section>
    );
  }

  return (
    <section className="k-card" aria-labelledby="creator-availability-title" data-testid="creator-availability" data-state="ready">
      <h2 id="creator-availability-title" style={{ marginTop: 0 }}>{t('Unavailable dates', '不可預約日期')}</h2>
      <p className="k-meta">{t('Travellers still see the guide; requests that touch these dates are refused.', '旅客仍可看到攻略；重疊這些日期的申請會被拒絕。')}</p>
      <form onSubmit={(event) => { event.preventDefault(); void add(); }} style={{ display: 'grid', gap: '8px', maxWidth: '30rem' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '4px' }}>{t('From', '開始')}
            <input type="date" required min={iso(0)} value={form.startsOn} onChange={(event) => setForm((current) => ({ ...current, startsOn: event.target.value }))} data-testid="availability-start" />
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>{t('To (optional)', '結束（可選）')}
            <input type="date" min={form.startsOn} value={form.endsOn} onChange={(event) => setForm((current) => ({ ...current, endsOn: event.target.value }))} data-testid="availability-end" />
          </label>
        </div>
        <button type="submit" className="k-btn" disabled={busy} style={{ justifySelf: 'start' }} data-testid="availability-add">
          {busy ? t('Saving…', '儲存中…') : t('Block dates', '封鎖日期')}
        </button>
      </form>
      {notice && <p role="status" data-testid="availability-notice">{notice}</p>}
      {ranges.length === 0 ? (
        <p data-testid="availability-empty">{t('No blocked dates.', '尚未封鎖任何日期。')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '6px', marginTop: '10px' }}>
          {ranges.map((range) => (
            <li key={range.id} data-testid="availability-row" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{range.startsOn}{range.endsOn !== range.startsOn ? ` – ${range.endsOn}` : ''}</span>
              <button type="button" className="k-btn" disabled={busy} onClick={() => void remove(range.id)} data-testid="availability-remove">
                {t('Remove', '移除')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
