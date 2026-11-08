'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Row = {
  id: string;
  kind: string;
  scope: string;
  note: string;
  status: 'received' | 'in_progress' | 'completed' | 'rejected';
  resolutionNote: string | null;
  createdAt: string;
};

const LABEL: Record<Row['status'], [string, string]> = {
  received: ['Received', '已收到'],
  in_progress: ['In progress', '處理中'],
  completed: ['Completed', '已完成'],
  rejected: ['Rejected', '已拒絕'],
};

/** Ops queue for recorded privacy requests. Nothing is answered outside this list,
 * so a request cannot be lost in an inbox and every resolution has a note. */
export function PrivacyQueue() {
  const { t } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<'access-required' | 'unavailable' | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, { status: Row['status']; note: string }>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/privacy?limit=100', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { setError('access-required'); setState('error'); return; }
      if (!response.ok) { setError('unavailable'); setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.items)) { setError('unavailable'); setState('error'); return; }
      setRows(payload.data.items);
      setError(null);
      setState('ready');
    } catch {
      setError('unavailable');
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async (row: Row) => {
    const value = draft[row.id] ?? { status: row.status, note: '' };
    setBusy(true);
    try {
      const response = await fetch('/api/ops/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status: value.status, note: value.note }),
      });
      if (!response.ok) { setError('unavailable'); return; }
      await load();
      setDraft((current) => { const next = { ...current }; delete next[row.id]; return next; });
    } catch {
      setError('unavailable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="k-card" aria-labelledby="privacy-queue-title" data-testid="privacy-queue" data-state={state}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 id="privacy-queue-title" style={{ margin: 0 }}>{t('Privacy requests', '私隱申請')}</h2>
        <button type="button" className="k-btn" onClick={() => void load()} disabled={busy} data-testid="privacy-queue-refresh">
          {busy ? t('Refreshing…', '重新載入中…') : t('Refresh', '重新載入')}
        </button>
      </div>
      {state === 'loading' && <p aria-live="polite">{t('Loading requests…', '正在載入申請…')}</p>}
      {state === 'error' && (
        <p role="alert" data-testid="privacy-queue-error" data-reason={error ?? 'unavailable'}>
          {error === 'access-required'
            ? t('Operations access is required to review privacy requests.', '審閱私隱申請需要營運存取權限。')
            : t('Privacy requests are unavailable right now. Retry.', '私隱申請暫時未能提供，請重試。')}
        </p>
      )}
      {state === 'ready' && rows && rows.length === 0 && <p data-testid="privacy-queue-empty">{t('No requests yet.', '尚未有申請。')}</p>}
      {state === 'ready' && rows && rows.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '10px' }}>
          {rows.map((row) => {
            const value = draft[row.id] ?? { status: row.status, note: '' };
            return (
              <li key={row.id} data-testid="privacy-queue-row" data-status={row.status} style={{ borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '10px' }}>
                <strong>{row.kind} · {row.scope}</strong> · {t(LABEL[row.status][0], LABEL[row.status][1])}
                <span className="k-meta" style={{ display: 'block' }}>{new Date(row.createdAt).toLocaleString()}{row.note ? ` · ${row.note}` : ''}</span>
                {row.resolutionNote && <span className="k-meta" style={{ display: 'block' }}>{row.resolutionNote}</span>}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' }}>
                  <select value={value.status} onChange={(event) => setDraft((current) => ({ ...current, [row.id]: { ...value, status: event.target.value as Row['status'] } }))}
                          style={{ maxWidth: '14rem' }} data-testid="privacy-queue-status">
                    <option value="received">{t('Received', '已收到')}</option>
                    <option value="in_progress">{t('In progress', '處理中')}</option>
                    <option value="completed">{t('Completed', '已完成')}</option>
                    <option value="rejected">{t('Rejected', '已拒絕')}</option>
                  </select>
                  <input value={value.note} placeholder={t('Resolution note', '處理說明')} maxLength={1000}
                         onChange={(event) => setDraft((current) => ({ ...current, [row.id]: { ...value, note: event.target.value } }))}
                         style={{ flex: '1 1 14rem' }} data-testid="privacy-queue-note" />
                  <button type="button" className="k-btn" disabled={busy} onClick={() => void update(row)} data-testid="privacy-queue-save">
                    {t('Save', '儲存')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
