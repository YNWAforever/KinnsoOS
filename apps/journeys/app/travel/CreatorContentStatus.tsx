'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ATTESTATION_STATEMENT_MAX,
  ATTESTATION_STATEMENT_MIN,
  type AttestationRightsBasis,
  type GuideHonestyStatus,
  type GuideRightsBasis,
} from '../../lib/content-honesty/contracts';
import { useApp } from './ui';

/**
 * Author-facing verification panel for one guide, mounted inside the creator
 * editor. It shows the ladder from unverified to verified (attestation, source
 * references, place verification by operations) and lets the author supply the
 * two parts they own: a rights attestation for the current published version and
 * the source list.
 *
 * GET /api/creator/guides/{id}/honesty is optional in the sense that the server
 * half may trail this UI: 401/403 (not this author), 404 (draft not found or the
 * route is not deployed) and 503 (backend off) hide the whole panel so the editor
 * is never blocked and the UI never invents a status. A malformed success body,
 * an unexpected status or a network failure render an explicit error with a
 * manual retry instead.
 *
 * Every write is confirmed by the server before the UI claims anything:
 * - POST /api/creator/guides/{id}/attest  (201 + ok:true, 400 INVALID, 403, 404,
 *   409 CONFLICT) — a 409 is shown as a conflict, never as a recorded attestation.
 * - PUT /api/creator/guides/{id}/sources (200 + ok:true, 400 INVALID, 403, 404, 503).
 * Both refetch the panel afterwards; rows with an invalid https URL are rejected
 * locally and never sent. "Verified" is only ever the server's word: this
 * component never derives it from local state.
 */
type SourceEntry = { title: string; url: string };

type CreatorHonesty = {
  published: boolean | null;
  status: GuideHonestyStatus;
  synthetic: boolean;
  rightsBasis: GuideRightsBasis;
  sourceCount: number | null;
  placeVerifiedAt: string | null;
  attestedAt: string | null;
  latestAttestedVersion: number | null;
  sources: SourceEntry[] | null;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: CreatorHonesty }
  | { kind: 'hidden' }
  | { kind: 'error' };

type FeedbackReason =
  | 'validation'
  | 'conflict'
  | 'access'
  | 'not-found'
  | 'unavailable'
  | 'unconfirmed';

type Feedback = { reason: FeedbackReason; text: string };

type SourceRow = { key: string; title: string; url: string; titleTouched: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HONESTY_STATUSES: readonly GuideHonestyStatus[] = ['synthetic', 'unverified', 'attested', 'verified'];
const RIGHTS_BASES: readonly GuideRightsBasis[] = ['original', 'licensed', 'unknown'];
const STATEMENT_MIN = ATTESTATION_STATEMENT_MIN;
const STATEMENT_MAX = ATTESTATION_STATEMENT_MAX;
const MAX_SOURCES = 20;
const SOURCE_TITLE_MAX = 200;
/** Mirrors kinnso_guide_set_sources(): ^https://[^\s]{1,500}$ after trimming. */
const SOURCE_URL = /^https:\/\/[^\s]{1,500}$/u;

const PANEL_STYLE: CSSProperties = {
  border: '1px solid var(--k-line, #dfe5e1)',
  borderRadius: 12,
  background: '#fff',
  padding: '18px 20px',
  margin: '26px 0',
  overflowWrap: 'anywhere',
};
const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px 12px',
  margin: '4px 0 14px',
};
const NOTE_STYLE: CSSProperties = {
  margin: '10px 0',
  color: 'var(--k-muted, #66736e)',
  fontSize: '0.85rem',
  lineHeight: 1.7,
};
const SOURCE_ROW_STYLE: CSSProperties = {
  border: '1px solid var(--k-line, #dfe5e1)',
  borderRadius: 10,
  background: '#fffdf8',
  padding: '12px 14px',
  margin: '12px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const LABEL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  color: 'var(--k-ink, #172a27)',
  fontSize: '0.85rem',
  lineHeight: 1.5,
};
const INPUT_STYLE: CSSProperties = {
  font: 'inherit',
  width: '100%',
  minHeight: 44,
  padding: '10px 12px',
  border: '1px solid var(--k-line, #dfe5e1)',
  borderRadius: 8,
  background: '#fff',
  color: 'var(--k-ink, #172a27)',
  boxSizing: 'border-box',
};
const FIELD_ERROR_STYLE: CSSProperties = {
  margin: 0,
  color: '#9f3424',
  fontSize: '0.8rem',
  lineHeight: 1.5,
};
const FIELDSET_STYLE: CSSProperties = {
  border: 0,
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
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

function readCount(value: unknown): number | null {
  const count = readNumber(value);
  return count !== null && count >= 0 ? Math.floor(count) : null;
}

function readStatus(value: unknown): GuideHonestyStatus | null {
  const status = readText(value);
  return status && (HONESTY_STATUSES as readonly string[]).includes(status) ? (status as GuideHonestyStatus) : null;
}

function readRightsBasis(value: unknown): GuideRightsBasis | null {
  const basis = readText(value);
  return basis && (RIGHTS_BASES as readonly string[]).includes(basis) ? (basis as GuideRightsBasis) : null;
}

/** PostgreSQL char_length counts code points, not UTF-16 units. */
function characterLength(value: string): number {
  return [...value].length;
}

/** PostgreSQL btrim(value) with the default ' ' character set removes only ASCII spaces. */
function btrimSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 32) start += 1;
  while (end > start && value.charCodeAt(end - 1) === 32) end -= 1;
  return value.slice(start, end);
}

/** The statement length the attestation RPC will validate (40..2000 code points). */
function statementLength(value: string): number {
  return characterLength(btrimSpaces(value));
}

function isHttpsSourceUrl(value: string): boolean {
  return SOURCE_URL.test(value);
}

function readSources(value: unknown): SourceEntry[] | null {
  if (!Array.isArray(value)) return null;
  const sources: SourceEntry[] = [];
  for (const item of value) {
    const record = readRecord(item);
    if (!record) return null;
    const title = readText(record.title);
    if (!title || characterLength(title) > SOURCE_TITLE_MAX) return null;
    let url = '';
    if (record.url !== undefined) {
      const parsed = readText(record.url);
      if (!parsed || !isHttpsSourceUrl(parsed)) return null;
      url = parsed;
    }
    sources.push({ title, url });
  }
  return sources;
}

/** Narrow an untrusted creator-honesty payload; a partial body is unreadable, not a default. */
function readHonesty(value: unknown): CreatorHonesty | null {
  const record = readRecord(value);
  if (!record) return null;
  const status = readStatus(record.status);
  if (!status) return null;
  const rightsBasis = readRightsBasis(record.rightsBasis);
  const synthetic = record.synthetic === true || status === 'synthetic';
  const placeVerifiedAt = readText(record.placeVerifiedAt);
  const attestedAt = readText(record.attestedAt);
  return {
    published: typeof record.published === 'boolean' ? record.published : null,
    status,
    synthetic,
    rightsBasis: rightsBasis ?? 'unknown',
    sourceCount: readCount(record.sourceCount),
    placeVerifiedAt,
    attestedAt,
    latestAttestedVersion: readCount(record.latestAttestedVersion),
    sources: readSources(record.sources),
  };
}

function statusLabel(status: GuideHonestyStatus, t: (en: string, zh: string) => string): string {
  if (status === 'synthetic') return t('Sample content', '示範內容');
  if (status === 'unverified') return t('Unverified author-published', '作者發布・未核實');
  if (status === 'attested') return t('Author-attested', '作者已聲明');
  return t('Verified', '已核實');
}

function statusChipClass(status: GuideHonestyStatus): string {
  if (status === 'verified') return 'k-chip green';
  if (status === 'attested') return 'k-chip';
  return 'k-chip amber';
}

function rightsBasisLabel(basis: GuideRightsBasis, t: (en: string, zh: string) => string): string {
  if (basis === 'original') return t('Rights basis: original work', '權利依據：原創作品');
  if (basis === 'licensed') return t('Rights basis: licensed content', '權利依據：授權內容');
  return t('Rights basis not provided', '未提供權利依據');
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

/** A place verification is a calendar date, so it is shown in UTC rather than
 *  shifted into the viewer's timezone (which would move it a day west of UTC). */
function formatPlaceDate(value: string | null, locale: 'en' | 'zh-HK'): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'zh-HK' ? 'zh-HK' : 'en-HK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return null;
  }
}

function attestFailure(status: number, t: (en: string, zh: string) => string): Feedback {
  if (status === 409) {
    return {
      reason: 'conflict',
      text: t(
        'A different attestation already exists for this version. Reload the status; the earlier attestation stands and nothing new was recorded.',
        '此版本已有另一份作者聲明。請重新載入狀態；較早的聲明仍然有效，未有記錄新的聲明。',
      ),
    };
  }
  if (status === 400) {
    return {
      reason: 'validation',
      text: t(
        'The attestation was rejected as invalid. Check the statement length and the rights basis; nothing was recorded.',
        '作者聲明被拒絕（無效）。請檢查聲明長度及權利依據；未有記錄。',
      ),
    };
  }
  if (status === 401 || status === 403) {
    return {
      reason: 'access',
      text: t(
        'You no longer have creator access to attest this guide. Sign in again before retrying.',
        '你已沒有為此攻略聲明的創作者權限。請重新登入後再試。',
      ),
    };
  }
  if (status === 404) {
    return {
      reason: 'not-found',
      text: t(
        'This guide was not found for attestation. Reload the draft and try again.',
        '找不到可聲明的攻略。請重新載入草稿後再試。',
      ),
    };
  }
  if (status === 503) {
    return {
      reason: 'unavailable',
      text: t(
        'Attestation is unavailable right now. Nothing was recorded; retry later.',
        '作者聲明服務暫時未能提供；未有記錄，請稍後重試。',
      ),
    };
  }
  return {
    reason: 'unconfirmed',
    text: t(
      'The attestation was not confirmed. Do not assume it was recorded; retry the same submission.',
      '作者聲明未獲確認。請勿假設已記錄；請重試相同提交。',
    ),
  };
}

function sourceFailure(status: number, t: (en: string, zh: string) => string): Feedback {
  if (status === 400) {
    return {
      reason: 'validation',
      text: t(
        'The source list was rejected as invalid. Each source needs a title (up to 200 characters) and, when given, a full https:// URL. Nothing was saved.',
        '來源清單被拒絕（無效）。每項來源須有名稱（最多 200 字元），如有網址須為完整 https:// 網址；未有保存。',
      ),
    };
  }
  if (status === 401 || status === 403) {
    return {
      reason: 'access',
      text: t(
        'You no longer have creator access to edit these sources. Sign in again before retrying.',
        '你已沒有編輯這些來源的創作者權限。請重新登入後再試。',
      ),
    };
  }
  if (status === 404) {
    return {
      reason: 'not-found',
      text: t('This guide was not found for sources. Reload the draft.', '找不到可更新來源的攻略，請重新載入草稿。'),
    };
  }
  if (status === 409) {
    return {
      reason: 'conflict',
      text: t(
        'The guide changed while saving. Reload the status and review the sources again.',
        '保存時攻略已有變動。請重新載入狀態並再次核對來源。',
      ),
    };
  }
  if (status === 503) {
    return {
      reason: 'unavailable',
      text: t(
        'Saving sources is unavailable right now. Nothing was confirmed; retry later.',
        '來源保存服務暫時未能提供；未獲確認，請稍後重試。',
      ),
    };
  }
  return {
    reason: 'unconfirmed',
    text: t(
      'The source list was not confirmed as saved. Do not assume it was saved; retry the same save.',
      '來源清單未獲確認已保存。請勿假設已保存；請重試相同保存。',
    ),
  };
}

export function CreatorContentStatus({
  guideId,
  publishedVersion = null,
  className,
}: {
  guideId: string;
  publishedVersion?: number | null;
  className?: string;
}) {
  const { t, locale } = useApp();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rightsChoice, setRightsChoice] = useState<AttestationRightsBasis | ''>('');
  const [statement, setStatement] = useState('');
  const [attestBusy, setAttestBusy] = useState(false);
  const [attestError, setAttestError] = useState<Feedback | null>(null);
  const [attestMessage, setAttestMessage] = useState('');
  const [sourcesMessage, setSourcesMessage] = useState('');
  const statementHelpId = useId();
  const attestHeadingId = useId();
  const sourcesHeadingId = useId();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // Optional panel: no fetch runtime (e.g. a sandboxed harness) or a non-uuid
    // id hides it instead of throwing inside the editor.
    if (!UUID.test(guideId) || typeof fetch !== 'function' || typeof AbortController !== 'function') {
      setState({ kind: 'hidden' });
      return;
    }
    setRefreshing(true);
    void (async () => {
      try {
        const response = await fetch(`/api/creator/guides/${encodeURIComponent(guideId)}/honesty`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 503) {
          setState({ kind: 'hidden' });
          return;
        }
        if (!response.ok) {
          setState({ kind: 'error' });
          return;
        }
        const payload: unknown = await response.json().catch(() => null);
        if (!active || controller.signal.aborted) return;
        const record = readRecord(payload);
        if (!record || record.ok !== true) {
          setState({ kind: 'error' });
          return;
        }
        const data = readHonesty(record.data);
        setState(data ? { kind: 'ready', data } : { kind: 'error' });
      } catch {
        if (active && !controller.signal.aborted) setState({ kind: 'error' });
      } finally {
        if (active && !controller.signal.aborted) setRefreshing(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [guideId, publishedVersion, refreshKey]);

  const data = state.kind === 'ready' ? state.data : null;
  const synthetic = data ? data.synthetic || data.status === 'synthetic' : false;
  const attestVersion =
    typeof publishedVersion === 'number' && Number.isSafeInteger(publishedVersion) && publishedVersion >= 1
      ? publishedVersion
      : null;
  const canAttest = data !== null && !synthetic && attestVersion !== null;
  const statementCount = statementLength(statement);
  const statementTooShort = statementCount < STATEMENT_MIN;
  const statementTooLong = statementCount > STATEMENT_MAX;
  const sourcesKey = data && data.sources ? JSON.stringify(data.sources) : null;
  const placeDate = data ? formatPlaceDate(data.placeVerifiedAt, locale) : null;
  const attestationDate = data ? formatDate(data.attestedAt, locale) : null;
  const latestVersion = data && data.latestAttestedVersion !== null ? data.latestAttestedVersion : null;
  const alreadyAttestedThisVersion = attestVersion !== null && latestVersion === attestVersion;

  const missing: { key: string; text: string }[] = [];
  if (data) {
    if (synthetic) {
      missing.push({
        key: 'synthetic',
        text: t(
          'Replace the sample content; attestation and place checks cannot verify sample content.',
          '請替換示範內容；作者聲明及地點核實均不能核實示範內容。',
        ),
      });
    } else if (data.status !== 'verified') {
      if (data.attestedAt === null) {
        missing.push({
          key: 'attestation',
          text: t('Author rights attestation for the current version', '為目前版本提交作者權利聲明'),
        });
      }
      if (data.sourceCount === null) {
        missing.push({
          key: 'sources-unknown',
          text: t(
            'Source reference count could not be read; at least one source is required',
            '未能讀取來源引用數量；至少需要一個來源',
          ),
        });
      } else if (data.sourceCount < 1) {
        missing.push({ key: 'sources', text: t('At least one source reference', '至少一個來源引用') });
      }
      if (data.placeVerifiedAt === null) {
        missing.push({ key: 'place', text: t('Place verification by operations', '由營運核實地點資料') });
      }
      if (data.attestedAt !== null && (data.sourceCount ?? 0) > 0 && data.placeVerifiedAt !== null) {
        missing.push({
          key: 'status',
          text: t('Operations has not yet recorded verified status', '營運尚未記錄已核實狀態'),
        });
      }
    }
  }

  function submitAttest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAttest || attestVersion === null || attestBusy) return;
    if (rightsChoice !== 'original' && rightsChoice !== 'licensed') {
      setAttestError({
        reason: 'validation',
        text: t(
          'Choose the rights basis (original or licensed). Nothing was sent.',
          '請選擇權利依據（原創或授權）；未有送出。',
        ),
      });
      return;
    }
    if (statementCount < STATEMENT_MIN || statementCount > STATEMENT_MAX) {
      setAttestError({
        reason: 'validation',
        text: t(
          `The statement must be ${STATEMENT_MIN}–${STATEMENT_MAX} characters. Nothing was sent.`,
          `聲明須為 ${STATEMENT_MIN}–${STATEMENT_MAX} 字元；未有送出。`,
        ),
      });
      return;
    }
    setAttestError(null);
    setAttestMessage('');
    setAttestBusy(true);
    void (async () => {
      try {
        const response = await fetch(`/api/creator/guides/${encodeURIComponent(guideId)}/attest`, {
          method: 'POST',
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: attestVersion, rightsBasis: rightsChoice, statement }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setAttestError(attestFailure(response.status, t));
          return;
        }
        const record = readRecord(payload);
        const result = record && record.ok === true ? readRecord(record.data) : null;
        const version = result ? readNumber(result.version) : null;
        const status = result ? readStatus(result.status) : null;
        if (version === null || status === null) {
          setAttestError({
            reason: 'unconfirmed',
            text: t(
              'The server accepted the request, but the attestation could not be confirmed from the response. Reload the status before relying on it.',
              '伺服器已接受請求，但未能從回應確認作者聲明。請重新載入狀態後再作依賴。',
            ),
          });
          return;
        }
        setAttestMessage(
          t(
            `Attestation recorded for version ${version}. This is your claim; it does not verify the guide by itself.`,
            `已記錄第 ${version} 版的作者聲明。此為你的聲明，並不會自行完成核實。`,
          ),
        );
        setRightsChoice('');
        setStatement('');
        setRefreshKey((value) => value + 1);
      } catch {
        setAttestError({
          reason: 'unconfirmed',
          text: t(
            'The attestation was not confirmed. Do not assume it was recorded; retry the same submission.',
            '作者聲明未獲確認。請勿假設已記錄；請重試相同提交。',
          ),
        });
      } finally {
        setAttestBusy(false);
      }
    })();
  }

  function handleSourcesSaved(message: string) {
    if (message) setSourcesMessage(message);
    setRefreshKey((value) => value + 1);
  }

  const sourceCountChip =
    data === null
      ? ''
      : data.sourceCount === null
        ? t('Source count not provided', '來源數未提供')
        : data.sourceCount === 1
          ? t('1 source', '1 個來源')
          : t(`${data.sourceCount} sources`, `${data.sourceCount} 個來源`);

  const rootClass = className ? `k-card creator-content-status ${className}` : 'k-card creator-content-status';

  const attestBlockedReason = !data
    ? null
    : synthetic
      ? t(
          'Sample content cannot be attested. Replace the sample content first.',
          '示範內容不可聲明；請先替換示範內容。',
        )
      : attestVersion === null
        ? t(
            'Publish a version before attesting. Attestation applies to one published version, and no published version is recorded yet.',
            '請先發布版本方可聲明。作者聲明只適用於一個已發布版本，目前未有已發布版本紀錄。',
          )
        : null;

  return (
    <section
      className={rootClass}
      data-testid="creator-content-status"
      data-state={state.kind}
      aria-label={t('Content status', '內容狀態')}
      aria-busy={state.kind === 'loading' || refreshing}
      style={PANEL_STYLE}
    >
      <h2 style={{ marginTop: 0 }}>{t('Content status', '內容狀態')}</h2>

      {state.kind === 'loading' && (
        <p aria-live="polite" data-testid="creator-status-loading">
          {t('Checking content status…', '正在檢查內容狀態…')}
        </p>
      )}

      {state.kind === 'error' && (
        <>
          <p role="alert" data-testid="creator-status-error">
            {t(
              'Content status is unavailable right now. Retry to check the verification ladder.',
              '內容狀態暫時未能提供，請重試查看核實進度。',
            )}
          </p>
          <button
            type="button"
            className="k-btn"
            data-testid="creator-status-retry"
            disabled={refreshing}
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            {t('Retry status', '重試載入狀態')}
          </button>
        </>
      )}

      {data && (
        <>
          <div style={HEADER_STYLE}>
            <span className={statusChipClass(data.status)} data-testid="creator-status-chip" data-status={data.status}>
              {statusLabel(data.status, t)}
            </span>
            <span className="k-chip">{rightsBasisLabel(data.rightsBasis, t)}</span>
            <span className="k-chip">{sourceCountChip}</span>
            {attestVersion !== null && (
              <span className="k-chip" data-testid="creator-published-version">
                {t(`Published version ${attestVersion}`, `已發布第 ${attestVersion} 版`)}
              </span>
            )}
          </div>

          {refreshing && (
            <p className="k-meta" aria-live="polite">
              {t('Refreshing content status…', '正在重新載入內容狀態…')}
            </p>
          )}

          <h3 style={{ marginBottom: 6 }}>{t('What is still missing', '尚欠甚麼')}</h3>
          {missing.length === 0 ? (
            <p className="k-meta" data-testid="creator-missing" data-complete="true">
              {t(
                'All verification requirements are recorded. Operations still reviews the result.',
                '已記錄全部核實要求；結果仍由營運審核。',
              )}
            </p>
          ) : (
            <ul data-testid="creator-missing" style={{ margin: '6px 0 2px', paddingInlineStart: 20, lineHeight: 1.8 }}>
              {missing.map((item) => (
                <li key={item.key}>{item.text}</li>
              ))}
            </ul>
          )}

          <section data-testid="creator-attest-form" data-enabled={canAttest ? 'true' : 'false'} aria-labelledby={attestHeadingId}>
            <h3 id={attestHeadingId}>{t('Author rights attestation', '作者權利聲明')}</h3>
            {attestVersion !== null && (
              <p className="k-meta" style={{ marginTop: 0 }}>
                {t(`Attesting published version ${attestVersion}.`, `聲明對象：已發布第 ${attestVersion} 版。`)}
              </p>
            )}
            {attestationDate && (
              <p className="k-meta" style={{ marginTop: 0 }} data-testid="creator-attestation-recorded">
                {t(
                  `Latest attestation recorded ${attestationDate}${latestVersion !== null ? ` for version ${latestVersion}` : ''}.`,
                  `最近作者聲明記錄於 ${attestationDate}${latestVersion !== null ? `（第 ${latestVersion} 版）` : ''}。`,
                )}
              </p>
            )}
            {alreadyAttestedThisVersion && (
              <p className="k-meta" style={{ marginTop: 0 }}>
                {t(
                  'This published version is already attested. A different statement for the same version is rejected as a conflict; a new version needs its own attestation.',
                  '此已發布版本已有作者聲明。同一版本的不同聲明會被視為衝突而拒絕；新版本須另行聲明。',
                )}
              </p>
            )}
            {attestBlockedReason && (
              <p className="os-note" role="note" data-testid="creator-attest-unavailable" style={{ margin: '10px 0' }}>
                {attestBlockedReason}
              </p>
            )}
            <form className="k-form" onSubmit={submitAttest}>
              <fieldset style={FIELDSET_STYLE} disabled={!canAttest || attestBusy}>
                <label>
                  {t('Rights basis', '權利依據')}
                  <select
                    data-testid="creator-attest-rights"
                    value={rightsChoice}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRightsChoice(value === 'original' || value === 'licensed' ? value : '');
                    }}
                  >
                    <option value="">{t('Select a rights basis', '請選擇權利依據')}</option>
                    <option value="original">{t('I am the author of original content', '我是原創內容的作者')}</option>
                    <option value="licensed">{t('I hold a licence for this content', '我持有此內容的授權')}</option>
                  </select>
                </label>
                <label>
                  {t('Attestation statement', '聲明內容')}
                  <textarea
                    data-testid="creator-attest-statement"
                    value={statement}
                    maxLength={STATEMENT_MAX}
                    aria-describedby={statementHelpId}
                    placeholder={t(
                      'Describe the content you wrote or licensed for this version.',
                      '說明此版本中由你撰寫或獲授權的內容。',
                    )}
                    onChange={(event) => setStatement(event.target.value)}
                  />
                </label>
                <p
                  className="k-meta"
                  id={statementHelpId}
                  data-testid="creator-attest-count"
                  data-insufficient={statementTooShort || statementTooLong ? 'true' : 'false'}
                  style={{ margin: 0 }}
                >
                  {t(
                    `${statementCount} / ${STATEMENT_MAX} characters · minimum ${STATEMENT_MIN}`,
                    `${statementCount} / ${STATEMENT_MAX} 字元 · 最少 ${STATEMENT_MIN}`,
                  )}
                </p>
                {attestError && (
                  <p role="alert" data-testid="creator-attest-error" data-reason={attestError.reason} style={FIELD_ERROR_STYLE}>
                    {attestError.text}
                  </p>
                )}
                <div className="k-actions">
                  <button type="submit" className="k-btn primary" data-testid="creator-attest-submit" disabled={attestBusy}>
                    {attestBusy ? t('Recording attestation…', '正在記錄作者聲明…') : t('Record attestation', '記錄作者聲明')}
                  </button>
                </div>
              </fieldset>
            </form>
            {attestMessage && (
              <p aria-live="polite" data-testid="creator-attest-message" style={{ margin: '10px 0 0' }}>
                {attestMessage}
              </p>
            )}
          </section>

          <section data-testid="creator-sources" data-editable={data.sources ? 'true' : 'false'} aria-labelledby={sourcesHeadingId}>
            <h3 id={sourcesHeadingId}>{t('Sources', '來源')}</h3>
            {data.sources ? (
              <SourcesEditor
                key={sourcesKey ?? 'sources'}
                guideId={guideId}
                sources={data.sources}
                onSaved={handleSourcesSaved}
              />
            ) : (
              <p className="k-meta" data-testid="creator-sources-unavailable">
                {t(
                  'The current server response did not include the source list, so it cannot be edited here.',
                  '目前伺服器回應未包含來源清單，因此未能在此編輯。',
                )}
              </p>
            )}
            {sourcesMessage && (
              <p aria-live="polite" data-testid="creator-sources-message" style={{ margin: '10px 0 0' }}>
                {sourcesMessage}
              </p>
            )}
          </section>

          <p data-testid="creator-place-verified" data-recorded={data.placeVerifiedAt ? 'true' : 'false'} style={NOTE_STYLE}>
            {placeDate
              ? t(
                  `Operations verifies place details independently. Recorded ${placeDate}.`,
                  `地點資料由營運獨立核實，記錄於 ${placeDate}。`,
                )
              : t(
                  'Operations verifies place details independently. No place verification date is recorded yet.',
                  '地點資料由營運獨立核實；目前未有核實日期紀錄。',
                )}
          </p>

          <div className="k-actions">
            <button
              type="button"
              className="k-btn"
              data-testid="creator-status-refresh"
              disabled={refreshing}
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              {t('Refresh content status', '重新載入內容狀態')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

type SourcesEditorProps = {
  guideId: string;
  sources: readonly SourceEntry[];
  onSaved: (message: string) => void;
};

/**
 * Source list editor. Rows carry an optional https URL; a row that fails local
 * validation is shown inline and blocks the save, so no invalid URL is ever sent.
 * The parent remounts this editor when the server returns a different list, so
 * server truth wins over local edits after a successful save.
 */
function SourcesEditor({ guideId, sources, onSaved }: SourcesEditorProps) {
  const { t } = useApp();
  const [rows, setRows] = useState<SourceRow[]>(() =>
    sources.map((source, index) => ({
      key: `source-${index}`,
      title: source.title,
      url: source.url,
      titleTouched: false,
    })),
  );
  const [saveRequested, setSaveRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Feedback | null>(null);
  const nextKey = useRef(rows.length);
  const fieldIdPrefix = useId();

  function updateRow(index: number, patch: Partial<SourceRow>) {
    setRows((previous) => previous.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((previous) =>
      previous.length >= MAX_SOURCES
        ? previous
        : [...previous, { key: `source-new-${nextKey.current++}`, title: '', url: '', titleTouched: false }],
    );
  }

  function removeRow(index: number) {
    setRows((previous) => previous.filter((_, position) => position !== index));
  }

  function titleInvalid(row: SourceRow): boolean {
    const title = row.title.trim();
    return characterLength(title) === 0 || characterLength(title) > SOURCE_TITLE_MAX;
  }

  function urlInvalid(row: SourceRow): boolean {
    const url = row.url.trim();
    return url !== '' && !isHttpsSourceUrl(url);
  }

  function save() {
    if (busy) return;
    setSaveRequested(true);
    if (rows.some((row) => titleInvalid(row) || urlInvalid(row))) {
      setError({
        reason: 'validation',
        text: t(
          'Fix the highlighted sources before saving. Nothing was sent.',
          '請先修正標示的來源再保存；未有送出。',
        ),
      });
      return;
    }
    if (rows.length > MAX_SOURCES) {
      setError({
        reason: 'validation',
        text: t(
          `At most ${MAX_SOURCES} sources can be saved. Nothing was sent.`,
          `最多可保存 ${MAX_SOURCES} 個來源；未有送出。`,
        ),
      });
      return;
    }
    const payload = rows.map((row) => {
      const title = row.title.trim();
      const url = row.url.trim();
      return url === '' ? { title } : { title, url };
    });
    setError(null);
    setBusy(true);
    void (async () => {
      try {
        const response = await fetch(`/api/creator/guides/${encodeURIComponent(guideId)}/sources`, {
          method: 'PUT',
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: payload }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setError(sourceFailure(response.status, t));
          return;
        }
        const record = readRecord(body);
        if (!record || record.ok !== true) {
          setError({
            reason: 'unconfirmed',
            text: t(
              'The source list was not confirmed as saved. Reloading the status; do not rely on this save yet.',
              '未能確認來源清單已保存。現正重新載入狀態；暫不應依賴此次保存。',
            ),
          });
          onSaved('');
          return;
        }
        const parsed = readHonesty(record.data);
        onSaved(
          parsed
            ? t('Sources saved.', '來源已保存。')
            : t(
                'The server accepted the source list, but the updated status could not be read. Reloading it now.',
                '伺服器已接受來源清單，但未能讀取更新後狀態；現正重新載入。',
              ),
        );
      } catch {
        setError({
          reason: 'unconfirmed',
          text: t(
            'The source list was not confirmed as saved. Retry the same save; do not assume it was saved.',
            '來源清單未獲確認已保存。請重試相同保存；請勿假設已保存。',
          ),
        });
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div>
      <p className="k-meta" style={{ margin: '4px 0 0' }}>
        {t(`${rows.length} of ${MAX_SOURCES} sources`, `${rows.length} / ${MAX_SOURCES} 個來源`)}
        {rows.length >= MAX_SOURCES
          ? ` · ${t('Maximum reached; remove one to add another.', '已達上限；移除一項才可新增。')}`
          : ''}
      </p>
      {rows.map((row, index) => {
        const titleProblem = (saveRequested || row.titleTouched) && titleInvalid(row);
        const urlProblem = urlInvalid(row);
        const titleErrorId = `${fieldIdPrefix}-source-title-error-${index}`;
        const urlErrorId = `${fieldIdPrefix}-source-url-error-${index}`;
        return (
          <div key={row.key} style={SOURCE_ROW_STYLE}>
            <label style={LABEL_STYLE}>
              {t('Source title', '來源標題')}
              <input
                data-testid={`creator-source-title-${index}`}
                value={row.title}
                maxLength={SOURCE_TITLE_MAX}
                aria-invalid={titleProblem}
                aria-describedby={titleProblem ? titleErrorId : undefined}
                onBlur={() => updateRow(index, { titleTouched: true })}
                onChange={(event) => updateRow(index, { title: event.target.value })}
                style={INPUT_STYLE}
              />
            </label>
            {titleProblem && (
              <p id={titleErrorId} style={FIELD_ERROR_STYLE}>
                {t('Each source needs a title (up to 200 characters).', '每項來源須有名稱（最多 200 字元）。')}
              </p>
            )}
            <label style={LABEL_STYLE}>
              {t('HTTPS URL (optional)', 'HTTPS 網址（可選）')}
              <input
                data-testid={`creator-source-url-${index}`}
                type="url"
                inputMode="url"
                value={row.url}
                maxLength={500}
                aria-invalid={urlProblem}
                aria-describedby={urlProblem ? urlErrorId : undefined}
                onChange={(event) => updateRow(index, { url: event.target.value })}
                style={INPUT_STYLE}
              />
            </label>
            {urlProblem && (
              <p id={urlErrorId} style={FIELD_ERROR_STYLE}>
                {t('Use a full https:// URL with no spaces.', '請使用完整且不含空格的 https:// 網址。')}
              </p>
            )}
            <div className="k-actions">
              <button
                type="button"
                className="k-btn"
                data-testid={`creator-source-remove-${index}`}
                disabled={busy}
                onClick={() => removeRow(index)}
              >
                {t('Remove source', '移除來源')}
              </button>
            </div>
          </div>
        );
      })}
      <div className="k-actions" style={{ marginTop: 4 }}>
        <button
          type="button"
          className="k-btn"
          data-testid="creator-source-add"
          disabled={busy || rows.length >= MAX_SOURCES}
          onClick={addRow}
        >
          {t('Add source', '加入來源')}
        </button>
        <button
          type="button"
          className="k-btn primary"
          data-testid="creator-sources-save"
          disabled={busy}
          onClick={save}
        >
          {busy ? t('Saving sources…', '正在保存來源…') : t('Save sources', '保存來源')}
        </button>
      </div>
      {error && (
        <p role="alert" data-testid="creator-sources-error" data-reason={error.reason} style={FIELD_ERROR_STYLE}>
          {error.text}
        </p>
      )}
    </div>
  );
}
