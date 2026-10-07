export function safeReturnPath(value: unknown, locale = 'en'): string {
  const fallback = `/${locale === 'zh-HK' ? 'zh-HK' : 'en'}/trips`;
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\x00-\x20\x7f-\x9f]/.test(decoded) || decoded.includes('//') || decoded.split(/[/?#]/).includes('..') || /%(?:25|2f|5c)/i.test(value.split(/[?#]/)[0])) return fallback;
    const url = new URL(value, 'https://return.invalid');
    if (url.origin !== 'https://return.invalid' || !/^\/(en|zh-HK)(\/|$)/.test(url.pathname) ||
        /\/(sign-in|sign-out|sign-up|forgot-password|reset-password|auth)(\/|$)/.test(decoded.split(/[?#]/)[0])) return fallback;
    const path=url.pathname + url.search + url.hash;
    return path.length<=2048?path:fallback;
  } catch { return fallback; }
}
