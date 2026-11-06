import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try {
  subject = await import('../lib/merchants/offers.ts');
} catch {}

const valid = {
  title: 'Synthetic visit offer',
  terms: 'One synthetic offer for isolated merchant workflow verification.',
  discountKind: 'percent',
  discountValue: '10',
  commissionKind: 'flat',
  commissionValue: '5',
  validFrom: '2026-11-20T10:00:00.000Z',
  validTo: '2026-12-20T10:00:00.000Z',
  perVisitorLimit: '1',
  totalCap: '25',
  missionId: null,
};

test('merchant offer input normalizes exact bounded persistence values', () => {
  assert.equal(typeof subject.parseMerchantOffer, 'function');
  assert.deepEqual(subject.parseMerchantOffer(valid), {
    title: valid.title,
    terms: valid.terms,
    discountKind: 'percent',
    discountValue: 10,
    commissionKind: 'flat',
    commissionValue: 5,
    validFrom: valid.validFrom,
    validTo: valid.validTo,
    perVisitorLimit: 1,
    totalCap: 25,
    missionId: null,
  });
});

test('merchant offer rejects invalid amounts, date order, ids and injected fields', () => {
  for (const patch of [
    { title: '' },
    { title: 'x'.repeat(121) },
    { terms: '' },
    { terms: 'x'.repeat(1001) },
    { discountKind: 'percent', discountValue: '101' },
    { commissionKind: 'percent', commissionValue: '101' },
    { discountValue: '0' },
    { commissionValue: '0' },
    { validTo: '2026-11-20T10:00:00.000Z' },
    { perVisitorLimit: '1.5' },
    { totalCap: '0' },
    { missionId: 'not-a-uuid' },
    { actorId: 'foreign' },
  ]) assert.throws(() => subject.parseMerchantOffer({ ...valid, ...patch }), /INVALID_OFFER/);
});

test('offer totals remain separate and use exact stored counters', () => {
  assert.equal(typeof subject.summarizeMerchantOffers, 'function');
  assert.deepEqual(subject.summarizeMerchantOffers([
    { claimedCount: 2, redeemedCount: 1 },
    { claimedCount: 3, redeemedCount: 3 },
  ]), { claimed: 5, redeemed: 4 });
});
