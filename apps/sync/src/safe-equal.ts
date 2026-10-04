import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison for shared secrets.
 *
 * `a !== b` short-circuits on the first differing byte, so response latency leaks a
 * prefix oracle an attacker can walk one character at a time. `timingSafeEqual` fixes
 * that but throws when the two buffers differ in length — which is itself a length
 * side-channel, and a throw the caller has to remember to catch.
 *
 * Hashing both sides first solves both: SHA-256 digests are always 32 bytes, so the
 * comparison is always length-matched and never throws, and the digest of a wrong-length
 * candidate reveals nothing about the real secret's length.
 *
 * An empty string on either side is always false: an unset secret must never authorize
 * a request that also omits it.
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()
  return timingSafeEqual(digest(a), digest(b))
}
