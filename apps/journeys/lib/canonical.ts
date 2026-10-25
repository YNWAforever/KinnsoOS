/** Same-origin navigation root. SEO source canonicals live separately in lib/seo. */
export function canonicalRoot(locale: string): string {
  return locale === "zh-HK" || locale === "zh-hk" ? "/zh-HK" : "/en";
}

/** Keep source provenance, but do not offer legacy-app navigation during the trial. */
export function trialNavigationHref(value: string): string | null {
  try {
    return new URL(value, 'https://navigation.invalid').hostname === 'remix-kinnso-web.vercel.app' ? null : value;
  } catch { return null; }
}
