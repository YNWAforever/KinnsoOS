import { formatMoneyMinor } from '../payments/format.ts';

/** Bilingual booking email bodies.
 *
 * Content is limited to what the in-app notification already exposes: guide title,
 * dates, party size, status and a link. The traveller's free-text message is never
 * copied into email because the product does not otherwise collect contact details.
 */
export type EmailPayload = {
  guideTitle?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  partySize?: number | null;
  status?: string | null;
  blockedStartsOn?: string | null;
  blockedEndsOn?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
};

const EVENT_TEXT: Record<string, { zh: string; en: string }> = {
  'booking.requested': { zh: '有新的預訂申請', en: 'New booking request' },
  'booking.withdrawn': { zh: '旅客已撤回預訂申請', en: 'A traveller withdrew a booking request' },
  'booking.accepted': { zh: '你的預訂申請已接受', en: 'Your booking request was accepted' },
  'booking.declined': { zh: '你的預訂申請已婉拒', en: 'Your booking request was declined' },
  'booking.dates_blocked': { zh: '創作者封鎖了與你申請重疊的日期', en: 'The creator blocked dates that overlap your request' },
  'booking.paid': { zh: '付款完成，旅程已確認', en: 'Payment received; your trip is confirmed' },
  'booking.payment_received': { zh: '旅客已付款，旅程已確認', en: 'A traveller paid; the trip is confirmed' },
  'booking.payment_expired': { zh: '付款期限已過，預訂已取消', en: 'Payment window expired; the booking was cancelled' },
  'booking.payment_window_expired': { zh: '旅客未在期限內付款，預訂已取消', en: 'The traveller did not pay in time; the booking was cancelled' },
  'email.test': { zh: 'Kinnso 電郵系統測試', en: 'Kinnso email self-test' },
};

const ROLE_PATH: Record<string, string> = {
  'booking.requested': '/studio',
  'booking.withdrawn': '/studio',
  'booking.accepted': '/requests',
  'booking.declined': '/requests',
  'booking.dates_blocked': '/requests',
  'booking.paid': '/requests',
  'booking.payment_received': '/studio',
  'booking.payment_expired': '/requests',
  'booking.payment_window_expired': '/studio',
  'email.test': '/inbox',
};

const range = (payload: EmailPayload) => {
  const starts = payload.startsOn ?? '';
  const ends = payload.endsOn ? ` – ${payload.endsOn}` : '';
  return `${starts}${ends}`.trim();
};

export function renderBookingEmail(eventType: string, payload: EmailPayload, site: string, locale = 'zh-HK'): { subject: string; text: string } {
  const labels = EVENT_TEXT[eventType] ?? { zh: '預訂通知', en: 'Booking notification' };
  const path = ROLE_PATH[eventType] ?? '/inbox';
  const link = `${site.replace(/\/$/, '')}/${locale}${path}`;
  const guide = payload.guideTitle ?? '';
  const dates = range(payload);
  const party = payload.partySize ? `${payload.partySize}` : '';
  const blocked = payload.blockedStartsOn ? `${payload.blockedStartsOn}${payload.blockedEndsOn ? ` – ${payload.blockedEndsOn}` : ''}` : '';
  const amount = typeof payload.amountMinor === 'number' && payload.currency
    ? formatMoneyMinor(payload.amountMinor, payload.currency)
    : '';
  const lines = [
    labels.zh,
    '',
    guide ? `指南：${guide}` : '',
    dates ? `日期：${dates}` : '',
    party ? `人數：${party}` : '',
    amount ? `金額：${amount}` : '',
    blocked ? `封鎖日期：${blocked}` : '',
    '',
    `查看：${link}`,
    '',
    labels.en,
    '',
    guide ? `Guide: ${guide}` : '',
    dates ? `Dates: ${dates}` : '',
    party ? `Party: ${party}` : '',
    amount ? `Amount: ${amount}` : '',
    blocked ? `Blocked dates: ${blocked}` : '',
    '',
    `Open: ${link}`,
    '',
    '此為系統通知，請勿直接回覆。 / This is an automated notice; please do not reply.',
  ].filter((line) => line !== '');
  return { subject: `${labels.zh} · ${labels.en}`, text: lines.join('\n') };
}
