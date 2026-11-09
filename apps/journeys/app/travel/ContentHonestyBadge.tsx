'use client';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GuideHonesty, GuideHonestyStatus, GuideRightsBasis } from '../../lib/content-honesty/contracts';
import { useApp } from './ui';

/**
 * Compact content-honesty badge for a published guide.
 *
 * GET /api/guides/{id}/honesty is optional: the server half may trail this UI,
 * so a missing route, an auth failure, a malformed body or a network error all
 * hide the badge instead of blocking the guide page. The four states below are
 * the only claims this component ever makes; nothing is inferred from what the
 * server did not send. Status and rights-basis values are shared with the server
 * through lib/content-honesty/contracts so the UI cannot invent a fifth state.
 */
/** The contract says sourceCount is always a number; it is widened to null so a
 *  partial payload is shown as "not provided" instead of a fabricated 0. */
type Honesty = Pick<GuideHonesty, 'status' | 'rightsBasis' | 'placeVerifiedAt'> & { sourceCount: number | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HONESTY_STATUSES: readonly GuideHonestyStatus[] = ['synthetic', 'unverified', 'attested', 'verified'];
const RIGHTS_BASES: readonly GuideRightsBasis[] = ['original', 'licensed', 'unknown'];

const WRAP_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '6px 10px',
  margin: '12px 0',
};
const NOTE_STYLE: CSSProperties = {
  margin: 0,
  color: 'var(--k-muted, #66736e)',
  fontSize: '0.8rem',
  lineHeight: 1.6,
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Narrow an untrusted honesty payload; any missing state field means "render nothing". */
function readHonesty(value: unknown): Honesty | null {
  const record = readRecord(value);
  if (!record) return null;
  const status = readText(record.status);
  if (!status || !(HONESTY_STATUSES as readonly string[]).includes(status)) return null;
  const rights = readText(record.rightsBasis);
  const count = readNumber(record.sourceCount);
  return {
    status: status as GuideHonestyStatus,
    rightsBasis: rights && (RIGHTS_BASES as readonly string[]).includes(rights) ? (rights as GuideRightsBasis) : 'unknown',
    sourceCount: count !== null && count >= 0 ? Math.floor(count) : null,
    placeVerifiedAt: readText(record.placeVerifiedAt),
  };
}

/** Locale-aware date; an unparseable or absent date stays absent rather than guessed. */
function formatDate(value: string | null, locale: 'en' | 'zh-HK'): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'zh-HK' ? 'zh-HK' : 'en-HK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return null;
  }
}

export function ContentHonestyBadge({ guideId, className }: { guideId: string; className?: string }) {
  const app = useApp();
  // Public pages can render this badge without an AppContext (e.g. server rendering in tests); fall back to English copy.
  const t = (en: string, zh: string) => (app ? app.t(en, zh) : en);
  const [honesty, setHonesty] = useState<Honesty | null>(null);

  useEffect(() => {
    setHonesty(null);
    // The badge is optional decoration: render nothing where the runtime lacks
    // fetch/AbortController (e.g. sandboxed component harnesses) instead of throwing.
    if (!UUID.test(guideId) || typeof fetch !== 'function' || typeof AbortController !== 'function') return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/guides/${encodeURIComponent(guideId)}/honesty`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted || !response.ok) return;
        const payload: unknown = await response.json().catch(() => null);
        const record = readRecord(payload);
        if (!active || controller.signal.aborted || !record || record.ok !== true) return;
        const result = readHonesty(record.data);
        if (result) setHonesty(result);
      } catch {
        // Optional endpoint: any failure hides the badge instead of blocking the guide.
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [guideId]);

  if (!honesty) return null;

  const { status } = honesty;
  const label =
    status === 'synthetic'
      ? t('Sample content', '示範內容')
      : status === 'unverified'
        ? t('Unverified author-published', '作者發布・未核實')
        : status === 'attested'
          ? t('Author-attested', '作者已聲明')
          : t('Verified', '已核實');
  const chipClass = status === 'verified' ? 'k-chip green' : status === 'attested' ? 'k-chip' : 'k-chip amber';
  const basisLabel =
    honesty.rightsBasis === 'original'
      ? t('Original work', '原創作品')
      : honesty.rightsBasis === 'licensed'
        ? t('Licensed content', '授權內容')
        : t('Rights basis not provided', '未提供授權依據');

  let note: string;
  if (status === 'synthetic') {
    note = t('Sample content, not real editorial content.', '示範內容，並非真實編輯內容。');
  } else if (status === 'unverified') {
    note = t(
      'No author attestation, no source references, place details unverified.',
      '未有作者聲明、未有來源引用，地點資料未核實。',
    );
  } else if (status === 'attested') {
    note = t(
      'Author attestation only; sources and place details are still unverified.',
      '僅作者聲明；來源及地點資料仍未核實。',
    );
  } else {
    const sourcesEn =
      honesty.sourceCount === null
        ? 'Sources not provided'
        : honesty.sourceCount === 1
          ? '1 source'
          : `${honesty.sourceCount} sources`;
    const sourcesZh =
      honesty.sourceCount === null
        ? '來源數未提供'
        : honesty.sourceCount === 1
          ? '1 個來源'
          : `${honesty.sourceCount} 個來源`;
    const dateEn = formatDate(honesty.placeVerifiedAt, 'en');
    const dateZh = formatDate(honesty.placeVerifiedAt, 'zh-HK');
    note =
      dateEn && dateZh
        ? t(`${sourcesEn} · place details verified ${dateEn}`, `${sourcesZh} · 地點資料已於 ${dateZh} 核實`)
        : t(
            `${sourcesEn} · place verification date not provided`,
            `${sourcesZh} · 地點核實日期未提供`,
          );
  }

  return (
    <div
      className={className ? `k-honesty ${className}` : 'k-honesty'}
      role="status"
      aria-live="polite"
      aria-label={t('Content status', '內容狀態')}
      data-testid="content-honesty-badge"
      data-status={status}
      data-rights-basis={status === 'attested' ? honesty.rightsBasis : undefined}
      style={WRAP_STYLE}
    >
      <span className={chipClass} data-testid="content-honesty-label">
        {label}
      </span>
      {status === 'attested' && (
        <span className="k-chip" data-testid="content-honesty-rights">
          {basisLabel}
        </span>
      )}
      <p style={NOTE_STYLE} data-testid="content-honesty-note">
        {note}
      </p>
    </div>
  );
}
