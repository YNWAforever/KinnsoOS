// Creator-entered flat guide prices are HKD amounts with at most two decimals,
// converted to integer minor units before they ever leave the browser. Blank
// means "no price" (no payment obligation); it is not a traveller-visible "free".
export const GUIDE_PRICE_CURRENCY = 'HKD';
export const GUIDE_PRICE_MIN_MINOR = 100;
export const GUIDE_PRICE_MAX_MINOR = 10000000;
export type GuidePriceParse = { ok: true; priceMinor: number | null } | { ok: false; reason: 'format' | 'range' };
export function parseGuidePrice(value: string): GuidePriceParse {
  const text = value.trim();
  if (text === '') return { ok: true, priceMinor: null };
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return { ok: false, reason: 'format' };
  const priceMinor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(priceMinor) || priceMinor < GUIDE_PRICE_MIN_MINOR || priceMinor > GUIDE_PRICE_MAX_MINOR) return { ok: false, reason: 'range' };
  return { ok: true, priceMinor };
}
export function formatGuidePrice(priceMinor: number | null): string {
  if (priceMinor === null || !Number.isSafeInteger(priceMinor) || priceMinor < 0) return '';
  const whole = Math.trunc(priceMinor / 100);
  return `${whole}.${String(priceMinor % 100).padStart(2, '0')}`;
}
