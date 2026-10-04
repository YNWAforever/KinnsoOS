/**
 * Legacy MySQL DATETIME columns are read as zone-less wall-clock strings
 * (`2026-06-01 00:00:00`, because the reader sets `dateStrings: true`). Turning one
 * into an instant therefore requires knowing which zone the legacy app wrote it in;
 * that is operator-supplied via LEGACY_DB_TIMEZONE and validated in config.ts to be
 * either 'UTC' or a fixed `±HH:MM` offset, which is exactly what ISO 8601 accepts as
 * a suffix. Callers that have no config (pure transform unit tests) get UTC, which
 * is what this code always assumed.
 */
export function legacyToIso(s: string | null, timezone = 'UTC'): string | null {
  if (!s) return null
  const suffix = timezone === 'UTC' ? 'Z' : timezone
  const d = new Date(s.replace(' ', 'T') + suffix)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
