import { test } from 'node:test';
import assert from 'node:assert/strict';
const pricing = await import('../lib/creators/pricing.ts').catch(() => ({}));
test('price input converts HKD amounts to integer minor units and blank means no price', () => {
 assert.equal(typeof pricing.parseGuidePrice, 'function');
 for (const [input, priceMinor] of [['', null], ['1', 100], ['1.5', 150], ['1.50', 150], ['100000', 10000000], ['100000.00', 10000000]]) assert.deepEqual(pricing.parseGuidePrice(input), { ok: true, priceMinor });
});
test('price input refuses malformed amounts instead of rounding them', () => {
 for (const input of ['1.001', '1e2', '-1', '1,000', 'abc', '.5', '1.', '1.2.3', '０１']) assert.deepEqual(pricing.parseGuidePrice(input), { ok: false, reason: 'format' }, input);
});
test('price input enforces the HKD 1.00 to 100,000.00 range', () => {
 for (const input of ['0.99', '0', '100000.01', '999999999']) assert.deepEqual(pricing.parseGuidePrice(input), { ok: false, reason: 'range' }, input);
});
test('a saved price formats back into an editable two-decimal amount', () => {
 assert.equal(pricing.formatGuidePrice(null), '');
 assert.equal(pricing.formatGuidePrice(0), '0.00');
 assert.equal(pricing.formatGuidePrice(100), '1.00');
 assert.equal(pricing.formatGuidePrice(75050), '750.50');
 assert.equal(pricing.formatGuidePrice(123456), '1234.56');
 assert.equal(pricing.formatGuidePrice(10000000), '100000.00');
 assert.equal(pricing.formatGuidePrice(-1), '');
 assert.equal(pricing.formatGuidePrice(1.5), '');
});
