import type { Locale } from '../../travel/model';

/** Locale-aware clock time for the hourly-limit reset instant. */
export function formatResetAt(value: string | null | undefined, locale: Locale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'zh-HK' ? 'zh-HK' : 'en-HK', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return null;
  }
}

/** Latency label tuned for short tool turns: milliseconds below one second. */
export function formatLatency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

/** True unless the visitor asked for reduced motion. Server-safe. */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

export function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through to the manual generator */
  }
  const hex = '0123456789abcdef';
  let out = '';
  for (let index = 0; index < 32; index += 1) {
    out += hex[Math.floor(Math.random() * 16)];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-${'89ab'[Math.floor(Math.random() * 4)]}${out.slice(17, 20)}-${out.slice(20, 32)}`;
}
