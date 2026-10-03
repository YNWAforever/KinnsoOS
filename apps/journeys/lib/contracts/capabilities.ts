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

export function capabilities(env: Environment): Record<string, Capability> {
  const configured = backendTarget(env) !== null;
  const ready = new Set((env.KINNSO_ENABLED_CAPABILITIES ?? '').split(','));
  return Object.fromEntries(['auth', 'catalog', 'trips', 'bookmarks', 'media', 'sharing', 'booking', 'payment']
    .map((name) => [name, {
      mode: configured && (name === 'auth' || name === 'catalog' ||
        (ready.has(name) && !['booking', 'payment'].includes(name))) ? 'connected' : 'unavailable',
      dataOwner: 'backend', session: !['catalog', 'sharing'].includes(name),
      visibility: name === 'catalog' ? 'public' : 'private', transactionOwner: 'backend',
    } satisfies Capability]));
}
