import type { SinglePostResult } from './fetchers'

export type Confidence = 'verified_signal' | 'needs_review' | 'unavailable'

export function normalizeHandle(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/^@/, '').replace(/\/+$/, '')
}

export function resolveConfidence(
  post: SinglePostResult | null,
  creatorHandle: string | null,
  expectedId: string | null = null,
): Confidence {
  if (!post) return 'unavailable'
  // ID-first: canonical channel-id match (YouTube). Channel ids are opaque,
  // case-sensitive tokens — compare trimmed, exact case.
  if (post.authorId && expectedId && post.authorId.trim() === expectedId.trim()) {
    return 'verified_signal'
  }
  // Handle fallback (IG/Threads always; YouTube when ids unavailable/mismatched).
  const author = normalizeHandle(post.authorHandle)
  const expected = normalizeHandle(creatorHandle)
  if (author && expected && author === expected) return 'verified_signal'
  return 'needs_review'
}
