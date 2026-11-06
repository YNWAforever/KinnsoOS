import test from 'node:test';
import assert from 'node:assert/strict';

let subject = {};
try {
  subject = await import('../lib/creators/sessions.ts');
} catch {}

const valid = {
  title: 'Synthetic creator session',
  description: 'An isolated session used to verify creator workflows.',
  type: 'destination_briefing',
  startsAt: '2026-11-20T10:00:00.000Z',
  durationMinutes: 45,
  embedUrl: 'https://www.youtube.com/watch?v=abc123',
  replayUrl: '',
  destinationTags: ['Tokyo', 'Cafés'],
};

test('creator session input produces the exact bounded persistence payload', () => {
  assert.equal(typeof subject.parseCreatorSessionInput, 'function');
  assert.deepEqual(subject.parseCreatorSessionInput(valid), {
    title: valid.title,
    description: valid.description,
    type: valid.type,
    startsAt: valid.startsAt,
    durationMinutes: 45,
    embedUrl: 'https://www.youtube-nocookie.com/embed/abc123',
    replayUrl: null,
    destinationTags: ['Tokyo', 'Cafés'],
  });
});

test('creator session input rejects invalid, unbounded and unexpected fields', () => {
  for (const patch of [
    { title: '' },
    { title: 'x'.repeat(161) },
    { description: '' },
    { type: 'unknown' },
    { startsAt: 'not-a-date' },
    { durationMinutes: 0 },
    { durationMinutes: 1.5 },
    { embedUrl: 'https://example.test/video' },
    { replayUrl: 'javascript:alert(1)' },
    { destinationTags: ['x'.repeat(81)] },
    { destinationTags: Array.from({ length: 21 }, (_, index) => 'Tag ' + index) },
    { actorId: 'foreign' },
  ]) {
    assert.throws(() => subject.parseCreatorSessionInput({ ...valid, ...patch }), /INVALID_SESSION/);
  }
});

test('going live requires a valid embed while ended and cancelled do not', () => {
  assert.equal(subject.canSetSessionStatus('scheduled', { embedUrl: null }, 'live'), false);
  assert.equal(subject.canSetSessionStatus('scheduled', { embedUrl: 'https://www.youtube-nocookie.com/embed/abc123' }, 'live'), true);
  assert.equal(subject.canSetSessionStatus('live', { embedUrl: null }, 'ended'), true);
  assert.equal(subject.canSetSessionStatus('scheduled', { embedUrl: null }, 'cancelled'), true);
  assert.equal(subject.canSetSessionStatus('cancelled', { embedUrl: null }, 'live'), false);
});
