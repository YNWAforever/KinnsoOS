'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type Row = {
  id: string;
  title: string;
  status: string;
  synthetic: boolean;
  verified: boolean;
  saves: number;
  saves30d: number;
  contributions: number;
  points: number;
};
type Performance = {
  generatedAt: string;
  guides: Row[];
  totals: { guides: number; verified: number; saves: number; contributions: number; points: number };
  notes: string[];
};

/** Honest creator activity: what the product actually records, with small-sample cautions. */
export function CreatorPerformance() {
  const { t } = useApp();
  const [data, setData] = useState<Performance | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/creator/performance', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) { setState('hidden'); return; }
      if (!response.ok) { setState('error'); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.guides)) { setState('error'); return; }
      setData(payload.data);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (state === 'hidden') return null;
  if (state === 'loading') return <section className="k-card" aria-busy="true"><p role="status">{t('Loading your guide activity…', '正在載入攻略活動…')}</p></section>;
  if (state === 'error' || !data) {
    return (
      <section className="k-card" data-testid="creator-performance" data-state="error">
        <p role="alert">{t('Your guide activity could not be loaded. Retry later.', '攻略活動暫時未能載入，請稍後重試。')}</p>
        <button type="button" className="k-btn" onClick={() => void load()}>{t('Retry', '重試')}</button>
      </section>
    );
  }

  return (
    <section className="k-card" aria-labelledby="creator-performance-title" data-testid="creator-performance" data-state="ready">
      <h2 id="creator-performance-title" style={{ marginTop: 0 }}>{t('Guide activity', '攻略活動')}</h2>
      <p className="k-meta" data-testid="creator-performance-totals">
        {t('{guides} guides · {verified} verified · {saves} saves · {contributions} contributions ({points} points)', '{guides} 篇攻略 · {verified} 篇已核實 · {saves} 次收藏 · {contributions} 項貢獻（{points} 分）')
          .replace('{guides}', String(data.totals.guides))
          .replace('{verified}', String(data.totals.verified))
          .replace('{saves}', String(data.totals.saves))
          .replace('{contributions}', String(data.totals.contributions))
          .replace('{points}', String(data.totals.points))}
      </p>
      {data.guides.length === 0 ? (
        <p className="k-muted">{t('Publish a guide to start collecting activity.', '發布攻略後就會開始累積活動。')}</p>
      ) : (
        <div className="k-table-wrap">
          <table className="k-table" data-testid="creator-performance-table">
            <thead>
              <tr>
                <th scope="col">{t('Guide', '攻略')}</th>
                <th scope="col">{t('Content', '內容狀態')}</th>
                <th scope="col">{t('Saves', '收藏')}</th>
                <th scope="col">{t('Last 30 days', '近 30 日')}</th>
                <th scope="col">{t('Contributions', '貢獻')}</th>
              </tr>
            </thead>
            <tbody>
              {data.guides.map((row) => (
                <tr key={row.id} data-testid="creator-performance-row" data-verified={row.verified}>
                  <td>{row.title || t('Untitled guide', '未命名攻略')}</td>
                  <td>
                    <span className={row.verified ? 'k-chip green' : row.synthetic ? 'k-chip amber' : 'k-chip'}
                          style={{ color: row.verified ? undefined : row.synthetic ? '#78500f' : '#4f5c50' }}>
                      {row.verified ? t('Verified', '已核實') : row.synthetic ? t('Sample', '示範') : t('Unverified', '未核實')}
                    </span>
                    {row.status === 'draft' && <span className="k-meta"> · {t('Draft', '草稿')}</span>}
                  </td>
                  <td>{row.saves}</td>
                  <td>{row.saves30d}</td>
                  <td>{row.contributions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="k-meta" style={{ margin: '8px 0 0', paddingLeft: '1.1rem' }}>
        {data.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      <p className="k-meta" style={{ margin: 0 }}>{t('Updated', '更新時間')}: {new Date(data.generatedAt).toLocaleString()}</p>
    </section>
  );
}
