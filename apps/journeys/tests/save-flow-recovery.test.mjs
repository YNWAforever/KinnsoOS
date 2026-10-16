import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mount} from './helpers/guide-workspace-harness.mjs';

const guideId = '11111111-1111-4111-8111-111111111111';
const guide = {kind: 'summary', id: guideId, title: 'Published source guide', summary: 'Source summary', destinationId: null};

test('a failed guide refresh keeps the published guide and offers a retry instead of a dead end', async () => {
  const view = await mount('GuideWorkspace', {id: guideId, actorId: null, initialGuide: guide}, {
    guidesGet: async () => ({ok: false, code: 'UNAVAILABLE', retryable: true, requestId: 'r1'}),
    bookmarksList: async () => ({ok: true, data: {items: [], nextCursor: null}}),
    bookmarksToggle: async () => ({ok: true, data: {saved: true}}),
  });

  assert.match(view.text(), /Published source guide/, 'the already-published guide must stay on screen');
  assert.ok(view.button('Retry guide'), 'a transient refresh failure must be retryable');
});

test('a saved guide whose source was withdrawn can still be unbookmarked', async () => {
  const toggles = [];
  const view = await mount('BookmarkWorkspace', {actorId: '11111111-1111-4111-8111-222222222222'}, {
    guidesGet: async () => ({ok: false, code: 'NOT_FOUND', retryable: false, requestId: 'r1'}),
    bookmarksList: async () => ({ok: true, data: {items: [{guide_id: guideId, guides: null}], nextCursor: null}}),
    bookmarksToggle: async (...args) => { toggles.push(args); return {ok: true, data: {saved: false}}; },
  });

  assert.match(view.text(), /Source unavailable/);
  const remove = view.button('Remove bookmark');
  assert.ok(remove, 'a withdrawn source must still be removable');
  remove.props.onClick();
  await view.settle();

  assert.equal(toggles.length, 1, 'removal must go through the bookmark command');
  assert.equal(toggles[0][0], guideId);
  assert.equal(toggles[0][1], false);
  assert.match(toggles[0][2], /^[0-9a-f-]{36}$/, 'the command must carry a request id');
  assert.doesNotMatch(view.text(), /Source unavailable/, 'a confirmed removal must drop the row');
});
