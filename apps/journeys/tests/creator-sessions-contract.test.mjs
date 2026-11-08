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

test('stored live and replay embeds round-trip through the edit parser', () => {
  const stored = subject.parseCreatorSessionInput({...valid,replayUrl:'https://youtu.be/replay_123'});
  assert.deepEqual(subject.parseCreatorSessionInput({...stored,title:'Edited title'}),{...stored,title:'Edited title'});
});

test('nocookie input accepts only the canonical HTTPS embed shape', () => {
  for (const url of [
    'http://www.youtube-nocookie.com/embed/abc123',
    'https://youtube-nocookie.com/embed/abc123',
    'https://www.youtube-nocookie.com:443/embed/abc123',
    'https://user@www.youtube-nocookie.com/embed/abc123',
    'https://www.youtube-nocookie.com.evil.test/embed/abc123',
    'https://www.youtube-nocookie.com/embed/abc123/',
    'https://www.youtube-nocookie.com/watch?v=abc123',
    'https://www.youtube-nocookie.com/embed/abc123?autoplay=1',
    'https://www.youtube-nocookie.com/embed/abc123#fragment',
    'https://www.youtube-nocookie.com/embed/%61bc123',
    'https://www.youtube-nocookie.com/other/../embed/abc123',
  ]) assert.throws(() => subject.parseCreatorSessionInput({...valid,embedUrl:url}), /INVALID_SESSION/, url);
});
