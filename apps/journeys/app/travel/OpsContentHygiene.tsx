'use client';
import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GuideHonestyStatus, GuideRightsBasis } from '../../lib/content-honesty/contracts';
import { useApp } from './ui';

/**
 * Operations hygiene panel for published guides.
 *
 * Lists published guides with their honesty status (sorted by title) and lets
 * operations maintain the two facts only operations owns: the sample-content
 * flag and the place verification date. Author attestation and sources are read
 * here but never edited — those stay with the creator.
 *
 * GET /api/ops/guides?limit=50 is gated: 401/403 renders "operations access
 * required"; 404 (route not deployed yet), 503 (backend off) and any malformed
 * body/network failure render an explicit unavailable state with a manual retry.
 * A partial or unreadable payload is treated as unavailable instead of showing
 * invented rows. Every PATCH is refetched and only a 2xx + {ok:true} response is
 * ever reported as saved; failures and unconfirmed requests are shown inline and
 * never as a success. Dates are validated against YYYY-MM-DD before sending, and
 * clearing the sample flag is confirmed inline before the write is sent.
 */
type OpsGuide = {
  id: string;
  title: string;
  status: GuideHonestyStatus;
  synthetic: boolean;
  rightsBasis: GuideRightsBasis;
  sourceCount: number | null;
  placeVerifiedAt: string | null;
  attestedAt: string | null;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: OpsGuide[] }
  | { kind: 'error'; reason: 'access-required' | 'unavailable' };

type FeedbackReason =
  | 'saved'
  | 'validation'
  | 'conflict'
  | 'access-required'
  | 'not-found'
  | 'unavailable'
  | 'unconfirmed';

type Feedback = { kind: 'success' | 'error'; guideId: string; reason: FeedbackReason; text: string };

const HONESTY_STATUSES: readonly GuideHonestyStatus[] = ['synthetic', 'unverified', 'attested', 'verified'];
const RIGHTS_BASES: readonly GuideRightsBasis[] = ['original', 'licensed', 'unknown'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const PANEL_STYLE: CSSProperties = { paddingTop: 0, overflowWrap: 'anywhere' };
const ROW_STYLE: CSSProperties = {
  border: '1px solid var(--k-line, #dfe5e1)',
  borderRadius: 12,
  background: '#fff',
  padding: '14px 16px',
  margin: '14px 0',
};
const ROW_HEAD_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '6px 12px',
  margin: '0 0 8px',
};
const LABEL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  color: 'var(--k-ink, #172a27)',
  fontSize: '0.85rem',
  lineHeight: 1.5,
  maxWidth: 260,
};
const INPUT_STYLE: CSSProperties = {
  font: 'inherit',
  minHeight: 44,
  padding: '10px 12px',
  border: '1px solid var(--k-line, #dfe5e1)',
  borderRadius: 8,
  background: '#fff',
  color: 'var(--k-ink, #172a27)',
  boxSizing: 'border-box',
};
const CONFIRM_STYLE: CSSProperties = {
  border: '1px solid #e4c7c0',
  borderRadius: 10,
  background: '#fff9f7',
  padding: '12px 14px',
  margin: '10px 0',
};
const NOTE_STYLE: CSSProperties = {
  margin: '6px 0',
  color: 'var(--k-muted, #66736e)',
  fontSize: '0.83rem',
  lineHeight: 1.7,
};
const ERROR_STYLE: CSSProperties = {
  margin: '8px 0 0',
  color: '#9f3424',
  fontSize: '0.85rem',
  lineHeight: 1.6,
};
const SUCCESS_STYLE: CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--k-green, #2c5140)',
  fontSize: '0.85rem',
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

function readOpsGuide(value: unknown): OpsGuide | null {
  const record = readRecord(value);
  if (!record) return null;
  const id = readText(record.id);
  const title = readText(record.title);
  const status = readStatus(record.status);
  if (!id || !title || !status) return null;
  return {
    id,
    title,
    status,
    synthetic: record.synthetic === true || status === 'synthetic',
    rightsBasis: readRightsBasis(record.rightsBasis) ?? 'unknown',
    sourceCount: readCount(record.sourceCount),
    placeVerifiedAt: readText(record.placeVerifiedAt),
    attestedAt: readText(record.attestedAt),
  };
}

/**
 * Read the ops list. The documented body is {items:[...]}; the {ok,data}
 * envelope used by every other route is accepted too. One unreadable row makes
 * the whole payload unreadable — an omitted guide is never silently dropped.
 */
function readOpsGuides(payload: unknown): OpsGuide[] | null {
  const root = readRecord(payload);
  if (!root || root.ok === false) return null;
  const bag = root.ok === true ? readRecord(root.data) : root;
  if (!bag) return null;
  const raw = bag.items;
  if (!Array.isArray(raw)) return null;
  const items: OpsGuide[] = [];
  for (const entry of raw) {
    const row = readOpsGuide(entry);
    if (!row) return null;
    items.push(row);
  }
  return items.sort((left, right) => {
    const leftTitle = left.title.toLowerCase();
    const rightTitle = right.title.toLowerCase();
    if (leftTitle < rightTitle) return -1;
    if (leftTitle > rightTitle) return 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Turn any stored timestamp/date text into the YYYY-MM-DD the date input needs. */
function isoDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (match) return isRealIsoDate(match[1]) ? match[1] : null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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
/**
 * Chip colours measured against the shared k-chip backgrounds. The default
 * neutral (#637265 on #eef1ed) and amber (#986319 on #fbefda) pairs measure
 * 4.47:1 and 4.46:1, just under the 4.5:1 required for 12px text, so these
 * local overrides darken the foreground only.
 */
const CHIP_NEUTRAL = { color: '#4f5c50' } as const;
const CHIP_AMBER = { color: '#78500f' } as const;

function chipStyleFor(status: GuideHonestyStatus) {
  if (status === 'verified') return undefined;
  if (status === 'attested') return CHIP_NEUTRAL;
  return CHIP_AMBER;
}


function rightsBasisLabel(basis: GuideRightsBasis, t: (en: string, zh: string) => string): string {
  if (basis === 'original') return t('Original work', '原創作品');
  if (basis === 'licensed') return t('Licensed content', '授權內容');
  return t('Rights basis not provided', '未提供權利依據');
}

function evidenceFailure(status: number, guideId: string, t: (en: string, zh: string) => string): Feedback {
  if (status === 400) {
    return {
      kind: 'error',
      guideId,
      reason: 'validation',
      text: t(
        'The evidence change was rejected as invalid. Check the date or the sample-content flag; nothing was saved.',
        '證據變更被拒絕（無效）。請檢查日期或示範內容標記；未有保存。',
      ),
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'error',
      guideId,
      reason: 'access-required',
      text: t(
        'Operations access is required for this change. Sign in with an operations account.',
        '此變更需要營運存取權限。請以營運帳戶登入。',
      ),
    };
  }
  if (status === 404) {
    return {
      kind: 'error',
      guideId,
      reason: 'not-found',
      text: t(
        'This guide was not found in the published set. Reloading the list to check its current state.',
        '在已發布清單中找不到此攻略。現正重新載入清單核對目前狀態。',
      ),
    };
  }
  if (status === 409) {
    return {
      kind: 'error',
      guideId,
      reason: 'conflict',
      text: t(
        'The guide changed while saving. Reloading the list; review the current evidence before retrying.',
        '保存時攻略已有變動。現正重新載入清單；請核對目前證據後再試。',
      ),
    };
  }
  if (status === 503) {
    return {
      kind: 'error',
      guideId,
      reason: 'unavailable',
      text: t(
        'Evidence updates are unavailable right now. Nothing was saved; retry later.',
        '證據更新服務暫時未能提供；未有保存，請稍後重試。',
      ),
    };
  }
  return {
    kind: 'error',
    guideId,
    reason: 'unconfirmed',
    text: t(
      'The change was not confirmed. Reloading the list to check the current state; do not assume it was saved.',
      '變更未獲確認。現正重新載入清單核對目前狀態；請勿假設已保存。',
    ),
  };
}

export function OpsContentHygiene({ className }: { className?: string } = {}) {
  const { t, locale } = useApp();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [draftDates, setDraftDates] = useState<Record<string, string>>({});
  const headingId = useId();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
      setState({ kind: 'error', reason: 'unavailable' });
      return;
    }
    setRefreshing(true);
    void (async () => {
      try {
        const response = await fetch('/api/ops/guides?limit=50', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setState({ kind: 'error', reason: 'access-required' });
          return;
        }
        if (!response.ok) {
          setState({ kind: 'error', reason: 'unavailable' });
          return;
        }
        const payload: unknown = await response.json().catch(() => null);
        if (!active || controller.signal.aborted) return;
        const items = readOpsGuides(payload);
        setState(items ? { kind: 'ready', items } : { kind: 'error', reason: 'unavailable' });
      } catch {
        if (active && !controller.signal.aborted) setState({ kind: 'error', reason: 'unavailable' });
      } finally {
        if (active && !controller.signal.aborted) setRefreshing(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  async function mutate(
    guideId: string,
    body: Record<string, unknown>,
    successText: string,
    action: 'synthetic' | 'place',
  ) {
    if (busy !== null) return;
    setBusy(`${guideId}:${action}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/ops/guides/${encodeURIComponent(guideId)}/verification`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = evidenceFailure(response.status, guideId, t);
        setFeedback(failure);
        if (failure.reason === 'conflict' || failure.reason === 'not-found' || failure.reason === 'unconfirmed') {
          setRefreshKey((value) => value + 1);
        }
        return;
      }
      const record = readRecord(payload);
      if (!record || record.ok !== true) {
        setFeedback({
          kind: 'error',
          guideId,
          reason: 'unconfirmed',
          text: t(
            'The server accepted the change, but the updated row could not be read. Reloading the list to confirm it.',
            '伺服器已接受變更，但未能讀取更新後紀錄。現正重新載入清單確認。',
          ),
        });
        setRefreshKey((value) => value + 1);
        return;
      }
      setFeedback({ kind: 'success', guideId, reason: 'saved', text: successText });
      setConfirmingId(null);
      setDraftDates((previous) => {
        if (!(guideId in previous)) return previous;
        const next = { ...previous };
        delete next[guideId];
        return next;
      });
      setRefreshKey((value) => value + 1);
    } catch {
      setFeedback({
        kind: 'error',
        guideId,
        reason: 'unconfirmed',
        text: t(
          'The change was not confirmed. Reloading the list to check the current state; retry only after checking.',
          '變更未獲確認。現正重新載入清單核對目前狀態；請核對後才重試。',
        ),
      });
      setRefreshKey((value) => value + 1);
    } finally {
      setBusy(null);
    }
  }

  function savePlaceDate(item: OpsGuide) {
    const value = draftDates[item.id] ?? isoDate(item.placeVerifiedAt) ?? '';
    if (!isRealIsoDate(value)) {
      setFeedback({
        kind: 'error',
        guideId: item.id,
        reason: 'validation',
        text: t('Choose a valid date before saving. Nothing was sent.', '請選擇有效日期後保存；未有送出。'),
      });
      return;
    }
    void mutate(
      item.id,
      { placeVerifiedAt: value },
      t(
        'Place verification date saved. Verified status still depends on author attestation and sources.',
        '地點核實日期已保存。已核實狀態仍取決於作者聲明及來源。',
      ),
      'place',
    );
  }

  const rootClass = className ? `k-page ${className}` : 'k-page';
  const anyBusy = busy !== null;

  return (
    <section
      className={rootClass}
      data-testid="ops-content-hygiene"
      data-state={state.kind}
      aria-label={t('Guide evidence', '攻略證據')}
      aria-busy={state.kind === 'loading' || refreshing || anyBusy}
      style={PANEL_STYLE}
    >
      <h2 id={headingId} style={{ marginTop: 0 }}>
        {t('Guide evidence', '攻略證據')}
      </h2>
      <p className="k-muted">
        {t(
          'Operations sets the sample-content flag and the place verification date. Author attestation and sources stay with the creator.',
          '示範內容標記及地點核實日期由營運設定；作者聲明及來源由創作者負責。',
        )}
      </p>

      <div className="k-actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="k-btn"
          data-testid="ops-guides-refresh"
          disabled={state.kind === 'loading' || refreshing || anyBusy}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          {t('Refresh guide evidence', '重新載入攻略證據')}
        </button>
      </div>

      {state.kind === 'loading' && (
        <p role="status" aria-live="polite" data-testid="ops-loading">
          {t('Loading published guides…', '正在載入已發布攻略…')}
        </p>
      )}

      {state.kind === 'error' && (
        <>
          <p
            role="alert"
            data-testid="ops-error"
            data-reason={state.reason}
            style={ERROR_STYLE}
          >
            {state.reason === 'access-required'
              ? t(
                  'Operations access required to review guide evidence.',
                  '查看攻略證據需要營運存取權限。',
                )
              : t(
                  'Guide evidence is unavailable right now. Retry to check the published guides.',
                  '攻略證據暫時未能提供，請重試載入已發布攻略。',
                )}
          </p>
          <button
            type="button"
            className="k-btn"
            data-testid="ops-guides-retry"
            disabled={refreshing}
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            {t('Retry guide evidence', '重試載入攻略證據')}
          </button>
        </>
      )}

      {state.kind === 'ready' && state.items.length === 0 && (
        <p data-testid="ops-empty">{t('No published guides are listed.', '目前沒有已發布攻略。')}</p>
      )}

      {state.kind === 'ready' &&
        state.items.map((item, index) => {
          const dateValue = draftDates[item.id] ?? isoDate(item.placeVerifiedAt) ?? '';
          const placeDate = formatPlaceDate(item.placeVerifiedAt, locale);
          const attestationDate = formatDate(item.attestedAt, locale);
          const sourceLabel =
            item.sourceCount === null
              ? t('Source count not provided', '來源數未提供')
              : item.sourceCount === 1
                ? t('1 source', '1 個來源')
                : t(`${item.sourceCount} sources`, `${item.sourceCount} 個來源`);
          const feedbackHere = feedback && feedback.guideId === item.id ? feedback : null;
          return (
            <article key={item.id} style={ROW_STYLE} data-testid="ops-guide-row" data-guide-id={item.id}>
              <h3 style={ROW_HEAD_STYLE}>
                <span data-testid="ops-guide-title">{item.title}</span>
              </h3>
              <div style={ROW_HEAD_STYLE}>
                <span
                  className={statusChipClass(item.status)}
              style={chipStyleFor(item.status)}
                  data-testid="ops-guide-status"
                  data-status={item.status}
                >
                  {statusLabel(item.status, t)}
                </span>
                <span className="k-chip" style={CHIP_NEUTRAL}>{sourceLabel}</span>
                <span className="k-chip" style={CHIP_NEUTRAL}>{rightsBasisLabel(item.rightsBasis, t)}</span>
              </div>
              <p style={NOTE_STYLE}>
                {placeDate
                  ? t(`Place verified ${placeDate}.`, `地點已於 ${placeDate} 核實。`)
                  : t('Place verification date not recorded.', '未有地點核實日期紀錄。')}{' '}
                {attestationDate
                  ? t(`Author attested ${attestationDate}.`, `作者已於 ${attestationDate} 聲明。`)
                  : t('No author attestation recorded.', '未有作者聲明紀錄。')}
              </p>

              <div className="k-actions">
                <button
                  type="button"
                  className="k-btn"
                  data-testid={`ops-guide-synthetic-toggle-${index}`}
                  aria-pressed={item.synthetic}
                  disabled={anyBusy}
                  onClick={() => setConfirmingId((current) => (current === item.id ? null : item.id))}
                >
                  {item.synthetic
                    ? t('Remove sample-content flag', '移除示範內容標記')
                    : t('Mark as sample content', '標記為示範內容')}
                </button>
              </div>

              {confirmingId === item.id && (
                <div
                  style={CONFIRM_STYLE}
                  role="group"
                  aria-label={t('Confirm sample-content change', '確認示範內容變更')}
                >
                  <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>
                    {item.synthetic
                      ? t(
                          'Removing the sample flag does not verify this guide. It only allows attestation and place checks to count.',
                          '移除示範標記不會核實此攻略，只會讓作者聲明及地點核實可能計入。',
                        )
                      : t(
                          'Sample content cannot be verified, even with an author attestation or a place verification date.',
                          '示範內容不可被核實，即使已有作者聲明或地點核實日期。',
                        )}
                  </p>
                  <div className="k-actions">
                    <button
                      type="button"
                      className="k-btn primary"
                      data-testid={`ops-guide-synthetic-confirm-${index}`}
                      disabled={anyBusy}
                      onClick={() =>
                        void mutate(
                          item.id,
                          { synthetic: !item.synthetic },
                          item.synthetic
                            ? t(
                                'Sample-content flag removed. Verification still requires the other evidence.',
                                '已移除示範內容標記；核實仍須其他證據。',
                              )
                            : t(
                                'Guide marked as sample content. It cannot be verified until the flag is removed.',
                                '攻略已標記為示範內容；在移除標記前不可被核實。',
                              ),
                          'synthetic',
                        )
                      }
                    >
                      {t('Confirm change', '確認變更')}
                    </button>
                    <button
                      type="button"
                      className="k-btn"
                      data-testid={`ops-guide-synthetic-cancel-${index}`}
                      disabled={anyBusy}
                      onClick={() => setConfirmingId(null)}
                    >
                      {t('Cancel', '取消')}
                    </button>
                  </div>
                </div>
              )}

              <div className="k-actions" style={{ alignItems: 'flex-end' }}>
                <label style={LABEL_STYLE}>
                  {t('Place verification date', '地點核實日期')}
                  <input
                    type="date"
                    data-testid={`ops-guide-place-date-${index}`}
                    value={dateValue}
                    disabled={anyBusy}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraftDates((previous) => ({ ...previous, [item.id]: value }));
                      setFeedback(null);
                    }}
                    style={INPUT_STYLE}
                  />
                </label>
                <button
                  type="button"
                  className="k-btn"
                  data-testid={`ops-guide-place-save-${index}`}
                  disabled={anyBusy || dateValue === ''}
                  onClick={() => savePlaceDate(item)}
                >
                  {t('Save date', '保存日期')}
                </button>
                <button
                  type="button"
                  className="k-btn danger"
                  data-testid={`ops-guide-place-clear-${index}`}
                  disabled={anyBusy || item.placeVerifiedAt === null}
                  onClick={() =>
                    void mutate(
                      item.id,
                      { clearPlace: true },
                      t(
                        'Place verification date cleared. A guide without it cannot be verified.',
                        '地點核實日期已清除；沒有此日期的攻略不可被核實。',
                      ),
                      'place',
                    )
                  }
                >
                  {t('Clear date', '清除日期')}
                </button>
              </div>

              {feedbackHere && (
                <p
                  role={feedbackHere.kind === 'error' ? 'alert' : 'status'}
                  data-testid={feedbackHere.kind === 'error' ? 'ops-error' : 'ops-success'}
                  data-reason={feedbackHere.reason}
                  style={feedbackHere.kind === 'error' ? ERROR_STYLE : SUCCESS_STYLE}
                >
                  {feedbackHere.text}
                </p>
              )}
            </article>
          );
        })}
    </section>
  );
}
