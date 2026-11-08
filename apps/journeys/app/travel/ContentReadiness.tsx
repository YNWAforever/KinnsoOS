'use client';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ContentReadiness as ReadinessCounts } from '../../lib/content-honesty/contracts';
import { useApp } from './ui';

/**
 * Operations body for content readiness.
 *
 * GET /api/ops/content-readiness is optional: 401/403 means the viewer lacks
 * operations access, anything else (404 while the route is not deployed yet,
 * 503, malformed body, offline) reads as "unavailable" with a manual retry.
 * The page is definition-first: the verified rule is stated before any count,
 * and the gate verdict is derived only from that rule. Count fields are shared
 * with lib/content-honesty/contracts so the page cannot rename or invent one.
 */
type CountKey =
  | 'published'
  | 'verified'
  | 'attested'
  | 'unverified'
  | 'synthetic'
  | 'withSources'
  | 'withPlaceVerification'
  | 'attestedVersions';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ReadinessCounts }
  | { kind: 'error'; failure: 'access' | 'unavailable' };

const COUNTS: ReadonlyArray<{ key: CountKey; en: string; zh: string }> = [
  { key: 'published', en: 'Published', zh: '已發布' },
  { key: 'verified', en: 'Verified', zh: '已核實' },
  { key: 'attested', en: 'Author-attested', zh: '作者已聲明' },
  { key: 'unverified', en: 'Unverified', zh: '未核實' },
  { key: 'synthetic', en: 'Sample content', zh: '示範內容' },
  { key: 'withSources', en: 'With sources', zh: '有來源' },
  { key: 'withPlaceVerification', en: 'With place verification', zh: '有地點核實' },
  { key: 'attestedVersions', en: 'Attested versions', zh: '已聲明版本' },
];

const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 12,
  margin: '18px 0',
};
const COUNT_STYLE: CSSProperties = {
  background: '#fffdf8',
  border: '1px solid var(--k-line, #dfe5e1)',
  borderRadius: 12,
  padding: '12px 14px',
  minWidth: 0,
};
const COUNT_LABEL_STYLE: CSSProperties = {
  margin: 0,
  color: 'var(--k-muted, #66736e)',
  fontSize: '0.78rem',
  lineHeight: 1.5,
};
const COUNT_VALUE_STYLE: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--k-ink, #172a27)',
  fontSize: '1.5rem',
  fontWeight: 700,
  lineHeight: 1.2,
};
const GATE_STYLE: CSSProperties = {
  margin: '20px 0',
  padding: '16px 18px',
  border: '1px solid var(--k-line, #dfe5e1)',
  borderRadius: 12,
  background: '#fffdf8',
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readCount(record: Record<string, unknown>, key: string): number | null {
  const value = readNumber(record[key]);
  return value !== null && value >= 0 ? Math.floor(value) : null;
}

/** Narrow an untrusted readiness payload; a partial body counts as unreadable, not as zeros. */
function readReadiness(value: unknown): ReadinessCounts | null {
  const record = readRecord(value);
  if (!record) return null;
  const published = readCount(record, 'published');
  const synthetic = readCount(record, 'synthetic');
  const unverified = readCount(record, 'unverified');
  const attested = readCount(record, 'attested');
  const verified = readCount(record, 'verified');
  const withSources = readCount(record, 'withSources');
  const withPlaceVerification = readCount(record, 'withPlaceVerification');
  const attestedVersions = readCount(record, 'attestedVersions');
  if (
    published === null ||
    synthetic === null ||
    unverified === null ||
    attested === null ||
    verified === null ||
    withSources === null ||
    withPlaceVerification === null ||
    attestedVersions === null
  ) {
    return null;
  }
  return {
    published,
    synthetic,
    unverified,
    attested,
    verified,
    withSources,
    withPlaceVerification,
    attestedVersions,
    articleRows: readNumber(record.articleRows),
    fixtureArticles: readNumber(record.fixtureArticles),
  };
}

export function ContentReadiness({ className }: { className?: string } = {}) {
  const { t } = useApp();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const response = await fetch('/api/ops/content-readiness', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setState({ kind: 'error', failure: 'access' });
          return;
        }
        if (!response.ok) {
          setState({ kind: 'error', failure: 'unavailable' });
          return;
        }
        const payload: unknown = await response.json().catch(() => null);
        const record = readRecord(payload);
        if (!active || controller.signal.aborted) return;
        if (!record || record.ok !== true) {
          setState({ kind: 'error', failure: 'unavailable' });
          return;
        }
        const data = readReadiness(record.data);
        setState(data ? { kind: 'ready', data } : { kind: 'error', failure: 'unavailable' });
      } catch {
        if (active && !controller.signal.aborted) setState({ kind: 'error', failure: 'unavailable' });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  const data = state.kind === 'ready' ? state.data : null;
  const verdict = data && data.verified > 0 && data.synthetic === 0 ? 'ready' : 'blocked';

  return (
    <section
      className={className ? `k-page ${className}` : 'k-page'}
      data-testid="content-readiness"
      data-state={state.kind}
      aria-label={t('Content readiness', '內容準備度')}
    >
      <h1>{t('Content readiness', '內容準備度')}</h1>
      <p className="k-muted">
        {t(
          'A guide counts as verified only with author attestation, at least one source reference and a place verification date.',
          '攻略須同時具備作者聲明、至少一個來源引用及地點核實日期，方計為已核實。',
        )}
      </p>

      <div className="k-actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="k-btn"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={state.kind === 'loading'}
          data-testid="readiness-refresh"
        >
          {t('Refresh readiness', '重新載入內容準備度')}
        </button>
      </div>

      {state.kind === 'loading' && (
        <p role="status" data-testid="readiness-status">
          {t('Loading content readiness…', '正在載入內容準備度…')}
        </p>
      )}

      {state.kind === 'error' && (
        <p
          role="alert"
          data-testid="readiness-error"
          data-reason={state.failure === 'access' ? 'access-required' : 'unavailable'}
        >
          {state.failure === 'access'
            ? t(
                'Operations access required to view content readiness.',
                '查看內容準備度需要營運存取權限。',
              )
            : t(
                'Content readiness is unavailable right now. Retry to check again.',
                '內容準備度暫時未能提供，請重試。',
              )}
        </p>
      )}

      {data && (
        <>
          <dl data-testid="readiness-counts" style={GRID_STYLE}>
            {COUNTS.map((count) => (
              <div key={count.key} style={COUNT_STYLE}>
                <dt style={COUNT_LABEL_STYLE}>{t(count.en, count.zh)}</dt>
                <dd style={COUNT_VALUE_STYLE} data-testid={`readiness-count-${count.key}`}>
                  {data[count.key]}
                </dd>
              </div>
            ))}
          </dl>

          {data.articleRows === null || data.fixtureArticles === null ? (
            <p
              className="os-note"
              role="status"
              data-testid="readiness-article-corpus"
              data-measured="false"
            >
              {t('Article corpus not measurable yet.', '文章語料庫尚未可量度。')}
            </p>
          ) : (
            <p className="k-meta" data-testid="readiness-article-corpus" data-measured="true">
              {t('Article rows', '文章列數')}: {data.articleRows} · {t('Sample articles', '示範文章')}:{' '}
              {data.fixtureArticles}
            </p>
          )}

          <section
            data-testid="readiness-gate"
            data-verdict={verdict}
            aria-label={t('Readiness verdict', '準備度判定')}
            style={GATE_STYLE}
          >
            <h2 style={{ marginTop: 0 }}>{t('Launch gate', '上線判定')}</h2>
            <p role="status" style={{ margin: 0, fontWeight: 600 }}>
              {verdict === 'ready' ? t('Ready for review', '可進入審核') : t('Not launch-ready', '未達上線標準')}
            </p>
            {verdict === 'ready' ? (
              <p className="k-meta" style={{ margin: '8px 0 0' }}>
                {t(
                  'Verified guides exist and no sample content is published.',
                  '已有已核實攻略，且未發布示範內容。',
                )}
              </p>
            ) : (
              <ul data-testid="readiness-blockers" style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
                {data.verified === 0 && <li>{t('No verified guides yet.', '目前未有已核實攻略。')}</li>}
                {data.synthetic > 0 && (
                  <li>{t(`${data.synthetic} sample guides are published.`, `${data.synthetic} 篇示範內容已發布。`)}</li>
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
