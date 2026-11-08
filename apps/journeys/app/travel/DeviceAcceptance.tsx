'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Cell = {
  surface: string;
  platform: string;
  outcome: 'pass' | 'fail' | 'pending';
  note: string | null;
  recordedAt: string | null;
};
type Matrix = { cells: Cell[]; total: number; passed: number; failed: number; complete: boolean };

const SURFACES: [string, string, string][] = [
  ['public_site', 'Public site', '公開網站'],
  ['guide_reader', 'Guide reader', '攻略閱讀'],
  ['account', 'Account and data rights', '帳戶與資料權利'],
  ['studio_editor', 'Creator studio editor', '創作者編輯器'],
  ['spaces_chat', 'Spaces chat', '空間對話'],
  ['ops_pages', 'Operations pages', '營運頁面'],
];
const PLATFORMS: [string, string, string][] = [
  ['ios_safari', 'iOS Safari', 'iOS Safari'],
  ['android_chrome', 'Android Chrome', 'Android Chrome'],
  ['voiceover', 'VoiceOver', 'VoiceOver'],
  ['nvda', 'NVDA', 'NVDA'],
];

/** Ops-only device and assistive-tech acceptance matrix: one recorded outcome and
 * evidence note per surface × platform. The launch gate only counts a complete
 * passing matrix, or an explicitly dated waiver recorded in the launch panel. */
export function DeviceAcceptance() {
  const { t } = useApp();
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<'access-required' | 'unavailable' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { outcome: 'pass' | 'fail'; note: string }>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/devices', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { setError('access-required'); setState('error'); return; }
      if (!response.ok) { setError('unavailable'); setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.cells)) { setError('unavailable'); setState('error'); return; }
      setMatrix(payload.data);
      setError(null);
      setState('ready');
    } catch {
      setError('unavailable');
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const key = (surface: string, platform: string) => `${surface}:${platform}`;

  const save = async (cell: Cell, value: { outcome: 'pass' | 'fail'; note: string }) => {
    setBusy(key(cell.surface, cell.platform));
    try {
      const response = await fetch('/api/ops/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface: cell.surface, platform: cell.platform, outcome: value.outcome, note: value.note.trim() }),
      });
      if (response.status === 201) {
        await load();
        setDraft((current) => { const next = { ...current }; delete next[key(cell.surface, cell.platform)]; return next; });
      } else {
        setError('unavailable');
      }
    } catch {
      setError('unavailable');
    } finally {
      setBusy(null);
    }
  };

  const label = (pairs: [string, string, string][], id: string) => {
    const found = pairs.find(([value]) => value === id);
    return found ? t(found[1], found[2]) : id;
  };

  return (
    <section className="k-card" aria-labelledby="device-acceptance-title" data-testid="device-acceptance" data-state={state}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 id="device-acceptance-title" style={{ margin: 0 }}>{t('Device and assistive-tech acceptance', '實體裝置與無障礙技術驗收')}</h2>
        <button type="button" className="k-btn" onClick={() => void load()} disabled={state === 'loading'} data-testid="device-acceptance-refresh">
          {t('Refresh', '重新載入')}
        </button>
      </div>
      <p className="k-meta">{t('One recorded outcome per surface × platform, with the evidence note. The launch gate counts a complete passing matrix, or a dated waiver from the launch panel.', '每個「頁面 × 平台」記錄一項結果及依據；上線關卡只接受全部通過的矩陣，或上線面板中具期限的豁免。')}</p>
      {state === 'loading' && <p aria-live="polite">{t('Loading the acceptance matrix…', '正在載入驗收矩陣…')}</p>}
      {state === 'error' && (
        <p role="alert" data-testid="device-acceptance-error" data-reason={error ?? 'unavailable'}>
          {error === 'access-required'
            ? t('Operations access is required to record device acceptance.', '記錄裝置驗收需要營運存取權限。')
            : t('Device acceptance is unavailable right now. Retry.', '裝置驗收暫時未能提供，請重試。')}
        </p>
      )}
      {state === 'ready' && matrix && (
        <>
          <p role="status" data-testid="device-acceptance-progress" data-complete={matrix.complete}>
            {matrix.complete
              ? t('All cells passed.', '全部項目已通過。')
              : t('Recorded {passed} of {total} passing results, {failed} failing.', '已記錄 {passed}/{total} 項通過，{failed} 項失敗。').replace('{passed}', String(matrix.passed)).replace('{total}', String(matrix.total)).replace('{failed}', String(matrix.failed))}
          </p>
          <div style={{ display: 'grid', gap: '12px' }}>
            {SURFACES.map(([surface]) => (
              <div key={surface} data-testid="device-surface" data-surface={surface}>
                <strong>{label(SURFACES, surface)}</strong>
                <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
                  {PLATFORMS.map(([platform]) => {
                    const cell = matrix.cells.find((row) => row.surface === surface && row.platform === platform);
                    if (!cell) return null;
                    const id = key(surface, platform);
                    const value = draft[id] ?? { outcome: (cell.outcome === 'fail' ? 'fail' : 'pass') as 'pass' | 'fail', note: '' };
                    return (
                      <div key={id} data-testid="device-cell" data-cell={id} data-outcome={cell.outcome}
                           style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '6px' }}>
                        <span style={{ minWidth: '10rem' }}>{label(PLATFORMS, platform)}</span>
                        <span style={{ fontWeight: 600, color: cell.outcome === 'pass' ? '#1f6b3a' : cell.outcome === 'fail' ? '#8a1c1c' : '#78500f' }}>
                          {cell.outcome === 'pass' ? t('Pass', '通過') : cell.outcome === 'fail' ? t('Fail', '失敗') : t('Not recorded', '未記錄')}
                        </span>
                        <select value={value.outcome} onChange={(event) => setDraft((current) => ({ ...current, [id]: { ...value, outcome: event.target.value as 'pass' | 'fail' } }))} style={{ maxWidth: '10rem' }} data-testid="device-outcome">
                          <option value="pass">{t('Pass', '通過')}</option>
                          <option value="fail">{t('Fail', '失敗')}</option>
                        </select>
                        <input value={value.note} maxLength={1000} placeholder={t('Evidence note (20+ characters)', '依據說明（20 字以上）')}
                               onChange={(event) => setDraft((current) => ({ ...current, [id]: { ...value, note: event.target.value } }))}
                               style={{ flex: '1 1 16rem' }} data-testid="device-note" />
                        <button type="button" className="k-btn" disabled={busy === id} onClick={() => void save(cell, value)} data-testid="device-save">
                          {busy === id ? t('Saving…', '儲存中…') : t('Record', '記錄')}
                        </button>
                        {cell.note && <span className="k-meta" style={{ flexBasis: '100%', overflowWrap: 'anywhere' }}>{cell.note}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
