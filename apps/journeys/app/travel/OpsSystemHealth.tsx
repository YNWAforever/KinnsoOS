'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Check = { id: string; status: 'ok' | 'degraded' | 'fail'; detail: string; ms: number };
type Health = { status: 'ok' | 'degraded' | 'fail'; checkedAt: string; checks: Check[] };

const COLORS: Record<Check['status'], string> = {
  ok: '#1f6b3a',
  degraded: '#78500f',
  fail: '#8a1c1c',
};

/** Ops-only live health panel. Every check is a real authenticated request against
 * this deployment; a failure hides no state and never claims health it did not see. */
export function OpsSystemHealth({ className }: { className?: string } = {}) {
  const { t } = useApp();
  const [data, setData] = useState<Health | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<'access-required' | 'unavailable' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/ops/health', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) {
        setError('access-required');
        setState('error');
        return;
      }
      if (!response.ok) {
        setError('unavailable');
        setState('error');
        return;
      }
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: Health } | null;
      const value = payload?.ok === true ? payload.data : null;
      if (!value || !Array.isArray(value.checks) || typeof value.status !== 'string') {
        setError('unavailable');
        setState('error');
        return;
      }
      setData(value);
      setError(null);
      setState('ready');
    } catch {
      setError('unavailable');
      setState('error');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const label = t('System health', '系統健康');
  const statusText = (status: Health['status']) =>
    status === 'ok' ? t('Healthy', '正常') : status === 'degraded' ? t('Degraded', '降級') : t('Failing', '故障');
  const checkLabel = (id: string) =>
    ({
      database: t('Database and RPC grants', '資料庫及 RPC 授權'),
      'content-gate': t('Content gate', '內容關卡'),
      'cost-guard': t('Turn cost guard', '對話成本限制'),
      model: t('Model configuration', '模型設定'),
      deployment: t('Deployment identity', '部署識別'),
    })[id] ?? id;

  return (
    <section className="k-card" aria-labelledby="ops-system-health-title" data-testid="ops-system-health" data-state={state}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 id="ops-system-health-title" style={{ margin: 0 }}>{label}</h2>
        <button type="button" className="k-btn" onClick={() => void load()} disabled={busy} data-testid="ops-health-refresh">
          {busy ? t('Checking…', '檢查中…') : t('Check now', '立即檢查')}
        </button>
      </div>
      {state === 'loading' && <p role="note" aria-live="polite" data-testid="ops-health-loading">{t('Running live checks…', '正在執行即時檢查…')}</p>}
      {state === 'error' && (
        <p role="alert" data-testid="ops-health-error" data-reason={error ?? 'unavailable'}>
          {error === 'access-required'
            ? t('Operations access is required to run health checks.', '執行健康檢查需要營運存取權限。')
            : t('Health checks are unavailable right now. Retry to check again.', '健康檢查暫時未能提供，請重試。')}
        </p>
      )}
      {state === 'ready' && data && (
        <>
          <p data-testid="ops-health-summary" data-status={data.status} style={{ color: COLORS[data.status], fontWeight: 600 }}>
            {statusText(data.status)} · {new Date(data.checkedAt).toLocaleString()}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '8px' }}>
            {data.checks.map((check) => (
              <li key={check.id} data-testid="ops-health-check" data-check={check.id} data-status={check.status}
                  style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline', borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '8px' }}>
                <strong style={{ minWidth: '11rem' }}>{checkLabel(check.id)}</strong>
                <span style={{ color: COLORS[check.status], fontWeight: 600 }}>{statusText(check.status)}</span>
                <span className="k-meta" style={{ overflowWrap: 'anywhere' }}>{check.detail}</span>
                <span className="k-meta">{check.ms} ms</span>
              </li>
            ))}
          </ul>
          <p className="os-note" role="note">
            {t('These checks run inside this deployment. External alert delivery is not bound yet.', '這些檢查在此部署內執行；外部告警尚未接通。')}
          </p>
        </>
      )}
    </section>
  );
}
