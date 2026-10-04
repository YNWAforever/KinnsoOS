// Only currencies whose two-decimal monetary contracts are covered by the mature
// local settlement tests are enabled. Other currencies retain their recorded text.
export const minorDigits = Object.freeze({HKD:2, USD:2} as const);
export function toMinorUnits(amount: string | null, currency: string | null): string | null {
  if (!currency || !Object.hasOwn(minorDigits,currency) || amount === null || !/^\d+(?:\.\d+)?$/.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  if (/[^0]/.test(fraction.slice(2))) return null;
  return (BigInt(whole) * BigInt(100) + BigInt(fraction.slice(0, 2).padEnd(2, '0'))).toString();
}
export function displayMinorUnits(minor: string | null, currency: string | null): string | null {
  if (!currency || !Object.hasOwn(minorDigits,currency) || minor === null || !/^\d+$/.test(minor)) return null;
  const padded = minor.padStart(3, '0');
  return `${currency} ${padded.slice(0, -2)}.${padded.slice(-2)}`;
}
