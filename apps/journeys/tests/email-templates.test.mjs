import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBookingEmail } from '../lib/email/templates.ts';

test('accepted email is bilingual and links to the traveller tracker', () => {
  const body = renderBookingEmail('booking.accepted', { guideTitle: 'Kyoto walk', startsOn: '2026-12-01', endsOn: '2026-12-02', partySize: 2 }, 'https://kinnso-os.vercel.app');
  assert.match(body.subject, /已接受.*accepted/);
  assert.match(body.text, /Kyoto walk/);
  assert.match(body.text, /2026-12-01 – 2026-12-02/);
  assert.match(body.text, /https:\/\/kinnso-os\.vercel\.app\/zh-HK\/requests/);
  assert.match(body.text, /automated notice/);
});

test('new request email links creators to the studio and never includes free text', () => {
  const body = renderBookingEmail('booking.requested', { guideTitle: 'Bali surf', startsOn: '2026-12-05', partySize: 3, message: 'call me at 555' }, 'https://example.test');
  assert.match(body.text, /https:\/\/example\.test\/zh-HK\/studio/);
  assert.equal(body.text.includes('555'), false);
});

test('blocked-dates email names the blocked range', () => {
  const body = renderBookingEmail('booking.dates_blocked', { guideTitle: 'Bangkok food', startsOn: '2026-12-10', partySize: 2, blockedStartsOn: '2026-12-10', blockedEndsOn: '2026-12-12' }, 'https://example.test');
  assert.match(body.text, /封鎖日期：2026-12-10 – 2026-12-12/);
  assert.match(body.text, /Blocked dates: 2026-12-10 – 2026-12-12/);
});

test('unknown event type still renders a safe generic notice', () => {
  const body = renderBookingEmail('booking.unknown', {}, 'https://example.test');
  assert.match(body.subject, /預訂通知/);
  assert.match(body.text, /https:\/\/example\.test\/zh-HK\/inbox/);
});
