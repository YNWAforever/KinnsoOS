import { headers } from 'next/headers'

/**
 * Vercel-provided caller IP for rate limiting. Direct Vercel deployments
 * overwrite `x-forwarded-for` to prevent spoofing. Prefer the preserved
 * `x-vercel-forwarded-for` value if a proxy above Vercel changes that header.
 * Local/non-Vercel callers retain the existing fallbacks; a Verified Proxy
 * deployment must review its configured trusted client-IP header first.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const vercelForwardedFor = h.get('x-vercel-forwarded-for')
  if (vercelForwardedFor) return vercelForwardedFor.split(',')[0].trim()
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
