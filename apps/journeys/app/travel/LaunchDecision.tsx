'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Gate = {
  gate: string;
  kind: 'automatic' | 'signoff';
  status: 'accepted' | 'blocked' | 'pending' | 'rejected';
  detail: string;
  signedAt: string | null;
};
type LaunchData = {
  verdict: 'launch-ready' | 'hold';
  blockers: string[];
  gates: Gate[];
  content: { published: number; synthetic: number; unverified: number; verified: number; ready: boolean };
  checkedAt: string;
};

const STATUS_COLOR: Record<Gate['status'], string> = {
  accepted: '#1f6b3a',
  blocked: '#8a1c1c',
  rejected: '#8a1c1c',
  pending: '#78500f',
};

/** One decision surface for launch: automatic gates computed from live facts plus
 * explicit operations sign-offs. "Launch ready" is never inferred from absence of
 * work; every human gate needs an accepted or waived record with a note. */
export function LaunchDecision({ className }: { className?: string } = {}) {
  const { t } = useApp();
  const [data, setData] = useState<LaunchData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<'access-required' | 'unavailable' | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ gate: string; status: 'accepted' | 'waived' | 'rejected'; note: string; error?: string }>({
    gate: 'privacy',
    status: 'accepted',
    note: '',
  });

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/launch', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { setError('access-required'); setState('error'); return; }
      if (!response.ok) { setError('unavailable'); setState('error'); return; }
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: LaunchData } | null;
      if (!payload?.ok || !payload.data || !Array.isArray(payload.data.gates)) { setError('unavailable'); setState('error'); return; }
      setData(payload.data);
      setError(null);
      setState('ready');
    } catch {
      setError('unavailable');
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sign = async () => {
    const trimmed = form.note.trim();
    if (trimmed.length < 20 || trimmed.length > 2000) { setForm((f) => ({ ...f, error: 'note' })); return; }
    setBusy(true);
    setForm((f) => ({ ...f, error: undefined }));
    try {
      const response = await fetch('/api/ops/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate: form.gate, status: form.status, note: trimmed }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 201) { setForm((f) => ({ ...f, note: '' })); await load(); }
      else if (response.status === 400) setForm((f) => ({ ...f, error: 'invalid' }));
      else if (response.status === 401 || response.status === 403) setError('access-required');
      else setForm((f) => ({ ...f, error: 'unavailable' }));
    } catch {
      setForm((f) => ({ ...f, error: 'unavailable' }));
    } finally {
      setBusy(false);
    }
  };

  const gateLabel = (gate: string) =>
    ({
      content: t('Content', '內容'),
      alerting: t('Alerting', '告警'),
      rollback: t('Rollback rehearsed', '回滾演練'),
      backup: t('Backup and restore', '備份與還原'),
      privacy: t('Privacy review', '私隱審查'),
      accessibility: t('Accessibility review', '無障礙審查'),
      devices: t('Physical devices and screen readers', '實體裝置與讀屏'),
      payments: t('Payments scope', '付款範圍'),
    })[gate] ?? gate;
  const statusLabel = (status: Gate['status']) =>
    status === 'accepted' ? t('Accepted', '已接受') : status === 'blocked' ? t('Blocked', '受阻') : status === 'rejected' ? t('Rejected', '已拒絕') : t('Pending', '待處理');

  return (
    <section className="k-card" aria-labelledby="launch-decision-title" data-testid="launch-decision" data-state={state}>
      <h2 id="launch-decision-title">{t('Launch decision', '上線決策')}</h2>
      {state === 'loading' && <p aria-live="polite" data-testid="launch-loading">{t('Loading the launch state…', '正在載入上線狀態…')}</p>}
      {state === 'error' && (
        <p role="alert" data-testid="launch-error" data-reason={error ?? 'unavailable'}>
          {error === 'access-required'
            ? t('Operations access is required to view the launch decision.', '查看上線決策需要營運存取權限。')
            : t('The launch state is unavailable right now. Retry to check again.', '上線狀態暫時未能提供，請重試。')}
        </p>
      )}
      {state === 'ready' && data && (
        <>
          <p data-testid="launch-verdict" data-verdict={data.verdict} style={{ fontWeight: 700, color: data.verdict === 'launch-ready' ? '#1f6b3a' : '#8a1c1c' }}>
            {data.verdict === 'launch-ready' ? t('Launch ready', '可上線') : t('Hold', '暫停上線')}
            {data.blockers.length > 0 && ` · ${data.blockers.map(gateLabel).join('、')}`}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '8px' }}>
            {data.gates.map((gate) => (
              <li key={gate.gate} data-testid="launch-gate" data-gate={gate.gate} data-status={gate.status}
                  style={{ borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '8px' }}>
                <strong>{gateLabel(gate.gate)}</strong>{' '}
                <span style={{ color: STATUS_COLOR[gate.status], fontWeight: 600 }}>{statusLabel(gate.status)}</span>
                {gate.detail && <span className="k-meta" style={{ display: 'block', overflowWrap: 'anywhere' }}>{gate.detail}</span>}
              </li>
            ))}
          </ul>
          <form className="k-card" style={{ marginTop: '12px' }} onSubmit={(event) => { event.preventDefault(); void sign(); }} data-testid="launch-signoff-form">
            <h3 style={{ marginTop: 0 }}>{t('Record a decision', '記錄決策')}</h3>
            <label>{t('Gate', '關卡')}
              <select value={form.gate} onChange={(event) => setForm((f) => ({ ...f, gate: event.target.value }))} data-testid="launch-signoff-gate">
                {['rollback', 'backup', 'privacy', 'accessibility', 'devices', 'payments'].map((gate) => (
                  <option key={gate} value={gate}>{gateLabel(gate)}</option>
                ))}
              </select>
            </label>
            <label>{t('Decision', '決策')}
              <select value={form.status} onChange={(event) => setForm((f) => ({ ...f, status: event.target.value as typeof form.status }))} data-testid="launch-signoff-status">
                <option value="accepted">{t('Accepted', '已接受')}</option>
                <option value="waived">{t('Waived', '已豁免')}</option>
                <option value="rejected">{t('Rejected', '已拒絕')}</option>
              </select>
            </label>
            <label>{t('Evidence note (20–2000 characters)', '依據說明（20–2000 字）')}
              <textarea value={form.note} rows={3} onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))} data-testid="launch-signoff-note" />
            </label>
            {form.error && (
              <p role="alert" data-testid="launch-signoff-error" data-reason={form.error}>
                {form.error === 'note' ? t('Write at least 20 characters of evidence.', '請填寫至少 20 字依據。')
                  : form.error === 'invalid' ? t('That decision was rejected as invalid.', '此決策被判定為無效。')
                  : t('The decision could not be saved. Retry.', '決策未能保存，請重試。')}
              </p>
            )}
            <button type="submit" className="k-btn primary" disabled={busy} data-testid="launch-signoff-submit">
              {busy ? t('Saving…', '儲存中…') : t('Record decision', '記錄決策')}
            </button>
          </form>
          <p className="os-note" role="note">{t('Decisions are append-only; the latest record per gate wins.', '決策只會追加；每個關卡以最新一筆為準。')}</p>
        </>
      )}
    </section>
  );
}
