export type CapabilityMode = 'demo' | 'connected' | 'unavailable';
export type ErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'UNAVAILABLE';
export type ApiResult<T> = { ok: true; data: T } | {
  ok: false; code: ErrorCode; retryable: boolean; requestId: string;
};
export type Environment = Record<string, string | undefined>;
export type Capability = {
  mode: CapabilityMode; dataOwner: 'backend'; session: boolean;
  visibility: 'public' | 'private'; transactionOwner: 'backend';
};

export function backendTarget(env: Environment) {
  try {
    const origin = new URL(env.KINNSO_SUPABASE_URL ?? '');
    if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) return null;
    const local = env.KINNSO_ENVIRONMENT === 'local' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
    if (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) return null;
    if (origin.origin !== env.KINNSO_APPROVED_SUPABASE_ORIGIN ||
        origin.origin !== env.KINNSO_LEGACY_AUTH_ORIGIN) return null;
    const key = env.KINNSO_SUPABASE_PUBLISHABLE_KEY ?? '';
    if (!key || key.startsWith('sb_secret_')) return null;
    if (!key.startsWith('sb_publishable_')) {
      const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString());
      if (payload.role !== 'anon') return null;
    }
    return { origin: origin.origin, key };
  } catch { return null; }
}

/** Upload readiness is separate from owner-authenticated reads of existing media. */
export function mediaRuntimeConfigured(env: Environment): boolean {
  const target = backendTarget(env);
  if (!target) return false;
  try {
    if (env.KINNSO_MEDIA_RUNTIME === 'unified') {
      const origin = new URL(target.origin);
      const local = env.KINNSO_ENVIRONMENT === 'local' && origin.protocol === 'http:';
      if (local && target.origin !== 'http://127.0.0.1:58421' &&
          !(env.CI === 'true' && env.KINNSO_TEST_PROJECT === 'kinnso-v3' && target.origin === 'http://127.0.0.1:54421')) return false;
      const key = env.KINNSO_SUPABASE_SECRET_KEY ?? '';
      if (!key || /\s/.test(key)) return false;
      if (key.startsWith('sb_secret_')) return key.length > 'sb_secret_'.length;
      const parts = key.split('.');
      if (parts.length !== 3 || parts.some(part => !part)) return false;
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return claims.role === 'service_role' && (local ||
        (origin.hostname.endsWith('.supabase.co') && claims.ref === origin.hostname.slice(0, -'.supabase.co'.length)));
    }
    if (env.KINNSO_MEDIA_RUNTIME) return false;
    const service = env.KINNSO_SERVICES_ORIGIN;
    if (!service || service !== env.KINNSO_APPROVED_SERVICES_ORIGIN) return false;
    const origin = new URL(service);
    if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) return false;
    return origin.protocol === 'https:' ||
      (env.KINNSO_ENVIRONMENT === 'local' && origin.origin === 'http://127.0.0.1:3492');
  } catch { return false; }
}

export function capabilities(env: Environment): Record<string, Capability> {
  const configured = backendTarget(env) !== null;
  const ready = new Set((env.KINNSO_ENABLED_CAPABILITIES ?? '').split(','));
  return Object.fromEntries(['auth', 'catalog', 'trips', 'bookmarks', 'media', 'mediaUpload', 'sharing', 'creator', 'merchant', 'ops', 'notifications', 'agent', 'telemetry', 'booking', 'payment']
    .map((name) => [name, {
      mode: configured && (name === 'auth' || name === 'catalog' ||
        (name === 'mediaUpload' ? ready.has('media') && mediaRuntimeConfigured(env) :
          ready.has(name) && !['booking', 'payment'].includes(name))) ? 'connected' : 'unavailable',
      dataOwner: 'backend', session: !['catalog', 'sharing'].includes(name),
      visibility: name === 'catalog' ? 'public' : 'private', transactionOwner: 'backend',
    } satisfies Capability]));
}
