/** null when valid; otherwise a DB-style error key the action maps to localized copy. */
export function validateReason(reason: string): string | null {
  const r = (reason ?? '').trim()
  if (!r) return 'reason_required'
  if (r.length > 500) return 'reason_too_long'
  return null
}

export function validateBulkIds(ids: string[]): string | null {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) return 'bad_bulk'
  return null
}
