import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison for shared secrets (cron bearer tokens, the
 * revalidate secret).
 *
 * `a !== b` short-circuits on the first differing byte, so response latency
 * leaks a prefix oracle an attacker can walk one character at a time.
 * `timingSafeEqual` fixes that but throws when the buffers differ in length —
 * itself a length side-channel, and a throw every caller must remember to
 * catch. Hashing both sides first solves both: SHA-256 digests are always 32
 * bytes, so the comparison is length-matched and never throws, and the digest
 * of a wrong-length candidate reveals nothing about the real secret's length.
 *
 * An empty value on either side is always false, so an unset secret can never
 * authorize a request that also omits it.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()
  return timingSafeEqual(digest(a), digest(b))
}
