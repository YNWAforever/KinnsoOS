export function safeReturnPath(value: unknown, locale = 'en'): string {
  const fallback = `/${locale === 'zh-HK' ? 'zh-HK' : 'en'}/trips`;
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\x00-\x20]/.test(decoded) || decoded.includes('//') || decoded.split(/[/?#]/).includes('..')) return fallback;
    const url = new URL(value, 'https://return.invalid');
    if (url.origin !== 'https://return.invalid' || !/^\/(en|zh-HK)(\/|$)/.test(url.pathname) ||
        /\/(sign-in|sign-out|auth)(\/|$)/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
