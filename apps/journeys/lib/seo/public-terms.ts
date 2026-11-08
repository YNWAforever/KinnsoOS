export function sanitizePublicTerms(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value
      .normalize('NFC')
      .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const key = normalized.toLocaleLowerCase('en');
    if (normalized.length < 2 || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length === 8) break;
  }
  return result;
}
