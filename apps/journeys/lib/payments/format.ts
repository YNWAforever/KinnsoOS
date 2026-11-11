/** Display helpers for integer minor-unit money (client and server safe). */
export function formatMoneyMinor(amountMinor: number, currency: string): string {
  const sign = amountMinor < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(amountMinor));
  const whole = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  const symbol = currency === 'HKD' ? 'HK$' : `${currency} `;
  return `${sign}${symbol}${whole.toLocaleString('en-US')}.${cents}`;
}

export function formatPaymentDeadline(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
