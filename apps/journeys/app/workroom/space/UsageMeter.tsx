'use client';
import { useEffect, useState } from 'react';
import { useApp } from '../../travel/ui';
import type { ChatUsage } from '../../../lib/chat/contracts';
import { api } from './api';
import type { RateLimit } from './api';
import { formatResetAt } from './format';
import { readNumber, readText } from './values';

function validUsage(value: unknown): value is ChatUsage {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return readNumber(record.used) !== null && readNumber(record.limit) !== null && readText(record.resetAt) !== null;
}

/**
 * Hourly reply budget: used/limit plus the reset time.
 *
 * GET /api/spaces/usage is optional (the server half may not be deployed yet):
 * any failure simply hides the meter instead of breaking the composer.
 */
export function UsageMeter({ refreshKey = 0, rateLimit = null }: { refreshKey?: number; rateLimit?: RateLimit | null }) {
  const { t, locale } = useApp();
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void (async () => {
      const result = await api<ChatUsage>('/api/spaces/usage', { signal: controller.signal });
      if (!active || controller.signal.aborted) return;
      if (result.ok && validUsage(result.data)) {
        setUsage(result.data);
        setAvailable(true);
      } else {
        setAvailable(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  if (!available || !usage) return null;

  const used = Math.max(0, readNumber(usage.used) ?? 0);
  const limit = Math.max(0, readNumber(usage.limit) ?? 0);
  const reached = Boolean(rateLimit) || (limit > 0 && used >= limit);
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const resetText = formatResetAt(rateLimit?.resetAt ?? readText(usage.resetAt), locale);

  return (
    <div className="sp-usage" data-testid="usage-meter" data-limited={reached} role="group" aria-label={t('Reply allowance', '回覆額度')}>
      <span className="sp-usage-count">
        <strong>{used}</strong>
        {' / '}
        {limit}
      </span>
      <span
        className="sp-usage-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit || 1}
        aria-valuenow={used}
        aria-valuetext={`${used} / ${limit}`}
        aria-label={t('Replies used this hour', '本小時已用回覆')}
      >
        <span className="sp-usage-fill" style={{ width: `${percent}%` }} data-limited={reached} />
      </span>
      {reached ? (
        <span className="sp-usage-reset" data-limited="true">
          {t('Limit reached', '已達上限')}
          {resetText ? ` · ${t('resets', '重設')} ${resetText}` : ''}
        </span>
      ) : (
        <span className="sp-usage-reset">
          {resetText ? `${t('resets', '重設')} ${resetText}` : t('this hour', '本小時')}
        </span>
      )}
    </div>
  );
}
