/** Public product routes use the consolidated KinnsoOS origin and supported locale casing. */
export function canonicalRoot(locale: string): string {
  return "https://kinnso-os.vercel.app/" + (locale === "en" ? "en" : "zh-HK");
}
