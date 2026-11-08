/**
 * Small runtime readers for untrusted API/stream payloads.
 *
 * The spaces surface talks to endpoints that may be missing or older than the
 * UI during a staggered rollout, so every value is narrowed instead of cast.
 */

export function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readList(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
