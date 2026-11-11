import { timingSafeEqual } from 'node:crypto';

/** The origin the request was addressed to.
 *
 * Next normalises `request.url` to an internal host (`localhost` under `next start`)
 * while proxies and the production alias keep the Host header accurate, so the Host
 * header wins when present. Both the URL and Host are caller-controlled, so this is
 * still an exact-origin comparison, not a trust boundary.
 */
function requestOrigin(request: Request): string | null {
  try {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (!host) return url.origin;
    const forwarded = (request.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim();
    const protocol = forwarded || url.protocol.replace(/:$/, '');
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

/** A scheduler credential does not authorize another origin or an unconfigured environment. */
export function cronAccess(request: Request, env: Record<string, string | undefined>): 'AUTH_REQUIRED' | 'FORBIDDEN' | null {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 32 || secret.length > 1024 || secret.trim() !== secret) return 'AUTH_REQUIRED';
  const supplied = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from('Bearer ' + secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return 'AUTH_REQUIRED';
  try {
    const site = new URL(env.KINNSO_SITE_URL ?? '');
    const origin = requestOrigin(request);
    return !site.username && !site.password && site.pathname === '/' && !site.search && !site.hash && origin !== null && origin === site.origin ? null : 'FORBIDDEN';
  } catch {
    return 'FORBIDDEN';
  }
}
export const cronAuthorized = (request: Request, env: Record<string, string | undefined>) => cronAccess(request, env) === null;
