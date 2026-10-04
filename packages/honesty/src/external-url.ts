export type PublicExternalUrlIssue =
  | 'invalid_url'
  | 'https_required'
  | 'reserved_example_domain'

export function validatePublicExternalUrl(raw: string): PublicExternalUrlIssue | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return 'invalid_url'
  }
  if (url.protocol !== 'https:') return 'https_required'
  if (url.hostname.toLowerCase().split('.').includes('example')) return 'reserved_example_domain'
  return null
}

export const isPublicExternalUrl = (raw: string): boolean => validatePublicExternalUrl(raw) === null
