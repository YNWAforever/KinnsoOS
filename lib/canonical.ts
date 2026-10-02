/** The existing application uses lower-case locale segments. */
export function canonicalRoot(locale: string): string {
  return "https://remix-kinnso-web.vercel.app/" + (locale === "en" ? "en" : "zh-hk");
}
