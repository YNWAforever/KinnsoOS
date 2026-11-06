import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try {
  subject = await import('../lib/creators/ladder.ts');
} catch {}

test('creator tier progress uses the canonical thresholds', () => {
  assert.equal(typeof subject.progressToNext, 'function');
  assert.deepEqual(subject.progressToNext(0), { tier: 'seed', nextTier: 'rising', points: 0, pointsIntoTier: 0, pointsForNext: 50, pct: 0 });
  assert.equal(subject.progressToNext(50).tier, 'rising');
  assert.equal(subject.progressToNext(149).pointsForNext, 1);
  assert.equal(subject.progressToNext(150).tier, 'pro');
  assert.deepEqual(subject.progressToNext(401), { tier: 'elite', nextTier: null, points: 401, pointsIntoTier: 1, pointsForNext: null, pct: 100 });
});

test('perk eligibility follows the authoritative stored tier and keeps unavailable values private', () => {
  assert.equal(typeof subject.projectPerk, 'function');
  const row = { id: '11111111-1111-4111-8111-111111111111', slug: 'rail-pass', partner_name: 'Partner', title: 'Rail pass', summary: 'A synthetic partner benefit', category: 'travel', discount_label: '10%', min_tier: 'rising', redemption_type: 'code', sort_order: 1 };
  assert.deepEqual(subject.projectPerk(row, 'rising', false), { id: row.id, slug: row.slug, partnerName: 'Partner', title: row.title, summary: row.summary, category: row.category, discountLabel: '10%', minTier: 'rising', redemptionType: 'code', sortOrder: 1, eligible: true, redeemed: false });
  assert.equal(subject.projectPerk(row, 'seed', false).eligible, false);
  assert.equal(subject.projectPerk({ ...row, redemption_value: 'DO_NOT_EXPOSE' }, 'elite', true).redemptionValue, undefined);
});

test('ladder payload validation rejects malformed events and duplicate identities', () => {
  assert.equal(typeof subject.validateContributionEvents, 'function');
  const id = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(subject.validateContributionEvents([{ id, eventType: 'guide_published', points: 15, createdAt: '2026-11-01T00:00:00Z' }]), [{ id, eventType: 'guide_published', points: 15, createdAt: '2026-11-01T00:00:00Z' }]);
  for (const rows of [
    [{ id, eventType: 'unknown', points: 15, createdAt: '2026-11-01T00:00:00Z' }],
    [{ id, eventType: 'guide_published', points: -1, createdAt: '2026-11-01T00:00:00Z' }],
    [{ id, eventType: 'guide_published', points: 15, createdAt: 'invalid' }],
    [
      { id, eventType: 'guide_published', points: 15, createdAt: '2026-11-01T00:00:00Z' },
      { id, eventType: 'guide_published', points: 15, createdAt: '2026-11-01T00:00:00Z' },
    ],
  ]) assert.throws(() => subject.validateContributionEvents(rows), /INVALID_LADDER/);
});
