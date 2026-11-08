import { headers } from 'next/headers'
import { isIP } from 'node:net'

/**
 * Vercel-provided caller IP for rate limiting. Direct Vercel deployments
 * overwrite `x-forwarded-for` to prevent spoofing. Prefer the preserved
 * `x-vercel-forwarded-for` value if a proxy above Vercel changes that header.
 * Local/non-Vercel callers retain the existing fallbacks; a Verified Proxy
 * deployment must review its configured trusted client-IP header first.
 */
export async function getClientIp(options: { trustedOnly?: boolean } = {}): Promise<string> {
  if (options.trustedOnly) {
    // Only Vercel's overwritten header is trusted for paid-request quotas. Other
    // deployments share a conservative bucket until a trusted ingress is defined.
    if (process.env.VERCEL !== '1') return 'unknown'
    const value = (await headers()).get('x-vercel-forwarded-for')?.split(',')[0].trim()
    return value && isIP(value) ? value : 'unknown'
  }
  const h = await headers()
  const vercelForwardedFor = h.get('x-vercel-forwarded-for')
  if (vercelForwardedFor) return vercelForwardedFor.split(',')[0].trim()
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
