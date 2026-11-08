import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const contracts = await import('../lib/chat/contracts.ts');

const app = fileURLToPath(new URL('..', import.meta.url));
const repo = path.join(app, '..', '..');
const read = (relative) => readFileSync(path.join(app, relative), 'utf8');
const migrationCandidates = [
  path.join(repo, 'supabase', 'migrations', '20261109100000_studio_chat_2.sql'),
  path.join(app, 'tests', 'contracts', '20261109100000_studio_chat_2.sql'),
];
const migrationPath = migrationCandidates.find((candidate) => existsSync(candidate));
const migration = migrationPath ? readFileSync(migrationPath, 'utf8') : '';
const compact = migration.replace(/\s+/g, ' ');

test('the hourly turn limit mirrors the database 1..200 clamp', () => {
  for (const [input, expected] of [
    [undefined, 30], [null, 30], ['', 30], ['  ', 30], ['abc', 30], [NaN, 30], [Infinity, 30],
    [0, 1], ['0', 1], [-7, 1], [1, 1], [45, 45], ['45', 45], [12.9, 12], [200, 200], [201, 200], [5000, 200],
    [{}, 30], [[] , 30], [true, 30],
  ]) assert.equal(contracts.chatTurnLimit(input), expected, String(input));
});

test('search limit and search query stay inside the RPC bounds', () => {
  for (const [input, expected] of [
    [undefined, 20], [null, 20], ['', 20], ['abc', 20], [0, 1], [-3, 1], [20, 20], ['25', 25],
    [50, 50], [51, 50], [1000, 50], [3.9, 3],
  ]) assert.equal(contracts.searchLimit(input), expected, String(input));
  assert.equal(contracts.searchQuery('  kyoto  '), 'kyoto');
  assert.equal(contracts.searchQuery('香港'), '香港');
  assert.equal(contracts.searchQuery('x'.repeat(80)), 'x'.repeat(80));
  for (const invalid of ['', '   ', 'x'.repeat(81), null, undefined, 42, {}, ['kyoto']]) {
    assert.equal(contracts.searchQuery(invalid), null, String(invalid));
  }
});

test('space updates are trimmed, bounded and reject malformed fields', () => {
  assert.deepEqual(contracts.parseSpaceUpdate({}), {});
  assert.deepEqual(
    contracts.parseSpaceUpdate({name: '  Winter trips  ', description: ' Keep  ', archived: true}),
    {name: 'Winter trips', description: 'Keep', archived: true},
  );
  assert.deepEqual(contracts.parseSpaceUpdate({description: ''}), {description: ''});
  assert.deepEqual(contracts.parseSpaceUpdate({unknown: 'ignored'}), {});
  for (const invalid of [
    null, undefined, [], 'space', 7,
    {name: ''}, {name: '   '}, {name: 'x'.repeat(81)}, {name: 12},
    {description: 'x'.repeat(281)}, {description: null},
    {archived: 'true'}, {archived: 1},
  ]) assert.equal(contracts.parseSpaceUpdate(invalid), null, JSON.stringify(invalid));
});

test('thread updates validate title, archive and pin independently', () => {
  assert.deepEqual(contracts.parseThreadUpdate({}), {});
  assert.deepEqual(contracts.parseThreadUpdate({title: '  Kyoto food  '}), {title: 'Kyoto food'});
  assert.deepEqual(contracts.parseThreadUpdate({archived: false, pinned: true}), {archived: false, pinned: true});
  assert.deepEqual(contracts.parseThreadUpdate({title: 'x'.repeat(120)}), {title: 'x'.repeat(120)});
  assert.deepEqual(contracts.parseThreadUpdate({spaceId: 'ignored'}), {});
  for (const invalid of [
    null, [], 'thread',
    {title: ''}, {title: '  '}, {title: 'x'.repeat(121)}, {title: 5},
    {archived: 'yes'}, {pinned: 1},
  ]) assert.equal(contracts.parseThreadUpdate(invalid), null, JSON.stringify(invalid));
});

test('only an explicit regenerate boolean re-answers the last user message', () => {
  assert.equal(contracts.regenerateRequested(true), true);
  for (const value of [false, 'true', 1, null, undefined, {}, []]) assert.equal(contracts.regenerateRequested(value), false, String(value));
});

test('assistant metadata is bounded, deduplicated and deterministic', () => {
  const metadata = contracts.assistantMetadata({
    model: '  gpt-test  ',
    tools: [{name: 'kinnso_search_guides', ok: true}, 'kinnso_list_my_trips', {name: 'kinnso_search_guides'}, {name: ''}, null, 42],
  }, 12.7);
  assert.deepEqual(metadata, {
    model: 'gpt-test',
    latencyMs: 13,
    toolCount: 2,
    tools: ['kinnso_search_guides', 'kinnso_list_my_trips'],
  });
  assert.deepEqual(contracts.assistantMetadata(null, -3), {model: 'unknown', latencyMs: 0, toolCount: 0, tools: []});
  assert.deepEqual(contracts.assistantMetadata({}, 'slow'), {model: 'unknown', latencyMs: 0, toolCount: 0, tools: []});
  const many = contracts.assistantMetadata({model: 'm', tools: Array.from({length: 40}, (_, index) => `tool_${index}`)}, 0);
  assert.equal(many.toolCount, 24);
  assert.equal(many.tools.length, 24);
  assert.ok(JSON.stringify(metadata).length < 16384);
});

test('contract helpers the routes depend on are exported and callable', () => {
  for (const name of ['chatTurnLimit', 'searchLimit', 'searchQuery', 'regenerateRequested', 'parseSpaceUpdate', 'parseThreadUpdate', 'assistantMetadata', 'toolSources', 'mergeToolSources']) {
    assert.equal(typeof contracts[name], 'function', name);
  }
});

const sourceId = (index) => `cc08a943-52fc-44e8-9310-${String(index).padStart(12, '0')}`;

test('tool sources surface only canonical, self-consistent guide and trip items', () => {
  const guideId = sourceId(1), tripId = sourceId(2);
  assert.deepEqual(contracts.toolSources({
    items: [
      {id: guideId, title: '  Kyoto guide  ', city: ' Kyoto ', path: '/g/' + guideId},
      {id: tripId, title: 'Trips', path: '/trips/' + tripId},
    ],
  }), [
    {kind: 'guide', id: guideId, title: 'Kyoto guide', city: 'Kyoto', path: '/g/' + guideId},
    {kind: 'trip', id: tripId, title: 'Trips', path: '/trips/' + tripId},
  ]);
  // The caller-supplied kind never wins: the canonical path decides.
  assert.equal(contracts.toolSources({items: [{id: tripId, kind: 'guide', title: 'Trip', path: '/trips/' + tripId}]})[0].kind, 'trip');
  // A case-different trailing UUID still identifies the same row and is normalised.
  assert.deepEqual(contracts.toolSources({items: [{id: tripId, title: 'Trip', path: '/trips/' + tripId.toUpperCase()}]}), [
    {kind: 'trip', id: tripId, title: 'Trip', path: '/trips/' + tripId},
  ]);
  // Titles/cities are bounded, and a bad city is omitted rather than persisted.
  assert.deepEqual(contracts.toolSources({items: [{id: guideId, title: 'x'.repeat(121), city: 7, path: '/g/' + guideId}]}), [
    {kind: 'guide', id: guideId, title: 'x'.repeat(120), path: '/g/' + guideId},
  ]);
});

test('tool sources reject mismatched paths, unknown kinds and malformed payloads', () => {
  for (const structured of [null, undefined, '', 'guide', 42, [], {}, {items: null}, {items: {}}, {items: 'x'}, {items: [null, 1, 'x']}]) {
    assert.deepEqual(contracts.toolSources(structured), [], JSON.stringify(structured));
  }
  const guideId = sourceId(1), otherId = sourceId(2);
  for (const item of [
    {id: guideId, title: 'Guide', path: '/g/' + otherId},           // path/id mismatch
    {id: guideId, title: 'Guide', path: '/places/' + guideId},      // unknown kind
    {id: guideId, title: 'Guide', path: '/g/' + guideId + '/extra'},// not canonical
    {id: guideId, title: 'Guide', path: guideId},                   // no path shape
    {id: 'not-a-uuid', title: 'Guide', path: '/g/not-a-uuid'},      // invalid uuid
    {id: guideId, title: '', path: '/g/' + guideId},                // empty title
    {id: guideId, title: 'Guide'},                                  // path absent
  ]) assert.deepEqual(contracts.toolSources({items: [item]}), [], JSON.stringify(item));
});

test('tool sources obey the per-result and per-turn caps', () => {
  const items = Array.from({length: 10}, (_, index) => ({id: sourceId(index), title: `Guide ${index}`, path: '/g/' + sourceId(index)}));
  const capped = contracts.toolSources({items});
  assert.equal(capped.length, 6);
  assert.deepEqual(capped.map((source) => source.id), items.slice(0, 6).map((item) => item.id));
  assert.equal(contracts.toolSources({items: [items[0], {...items[0], title: 'Again'}, items[1]]}).length, 2);
  const groups = Array.from({length: 5}, (_, group) => Array.from({length: 6}, (_, index) => {
    const id = sourceId(group * 6 + index);
    return {kind: 'guide', id, title: `G ${group}/${index}`, path: '/g/' + id};
  }));
  assert.equal(contracts.mergeToolSources(groups).length, 24);
  const guide = {kind: 'guide', id: sourceId(0), title: 'Guide', path: '/g/' + sourceId(0)};
  const trip = {kind: 'trip', id: sourceId(0), title: 'Trip', path: '/trips/' + sourceId(0)};
  assert.equal(contracts.mergeToolSources([[guide], [trip, guide]]).length, 2);
  for (const malformed of [null, undefined, 'nope', {}, [null], [[null]], [{kind: 'guide', id: 'x', title: 't', path: '/g/x'}]]) {
    assert.deepEqual(contracts.mergeToolSources(malformed), [], JSON.stringify(malformed));
  }
});

test('assistant metadata persists bounded sources inside the RPC metadata budget', () => {
  const sources = Array.from({length: 24}, (_, index) => ({kind: 'guide', id: sourceId(index), title: `Guide ${index}`, city: 'Kyoto', path: '/g/' + sourceId(index)}));
  const metadata = contracts.assistantMetadata({model: 'm', tools: ['kinnso_search_guides'], sources}, 5);
  assert.equal(metadata.toolCount, 1);
  assert.deepEqual(metadata.tools, ['kinnso_search_guides']);
  assert.equal(metadata.sources.length, 24);
  assert.deepEqual(metadata.sources[0], sources[0]);
  // Malformed sources are dropped, not persisted.
  assert.equal('sources' in contracts.assistantMetadata({model: 'm', sources: [{kind: 'guide', id: sourceId(1), title: 'ok', path: '/g/' + sourceId(2)}, null]}, 0), false);
  // Worst-case CJK titles/cities are byte-trimmed so the RPC's 16KB guard cannot trip.
  const heavy = contracts.assistantMetadata({model: 'm', sources: Array.from({length: 24}, (_, index) => ({
    kind: 'guide', id: sourceId(index), title: '遊'.repeat(120), city: '京'.repeat(80), path: '/g/' + sourceId(index),
  }))}, 0);
  assert.ok(heavy.sources.length > 0 && heavy.sources.length <= 24);
  assert.ok(new TextEncoder().encode(JSON.stringify(heavy)).length < 16384);
});

test('studio chat 2 migration is additive and keeps the private-RPC boundary', () => {
  assert.match(compact, /alter table public\.chat_messages add column metadata jsonb not null default '\{\}'::jsonb check \(jsonb_typeof\(metadata\) = 'object'\)/i);
  assert.match(compact, /alter table public\.chat_threads add column archived_at timestamptz/);
  assert.match(compact, /alter table public\.chat_threads add column pinned_at timestamptz/);
  assert.match(compact, /alter table public\.chat_spaces add column archived_at timestamptz/);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\./i);
  const definers = compact.match(/security definer set search_path=''/g) ?? [];
  assert.ok(definers.length >= 8, `expected every RPC to be security definer, found ${definers.length}`);
});

test('studio chat 2 exposes the documented RPC signatures', () => {
  assert.ok(compact.includes('create function public.chat_update_space(p_id uuid, p_name text default null, p_description text default null, p_archived boolean default null) returns jsonb'));
  assert.ok(compact.includes('create function public.chat_update_thread(p_id uuid, p_title text default null, p_archived boolean default null, p_pinned boolean default null) returns jsonb'));
  assert.ok(compact.includes('create function public.chat_search(p_query text, p_limit integer default 20) returns jsonb'));
  assert.ok(compact.includes('create function public.chat_usage() returns jsonb'));
  assert.ok(compact.includes("create function public.chat_append_message(p_thread_id uuid, p_request_id uuid, p_role text, p_body text, p_tool_name text, p_tool_payload jsonb, p_metadata jsonb) returns jsonb"));
  assert.ok(!migration.includes('drop function public.chat_append_message(uuid, uuid, text, text, text, jsonb)'),
    'the six-argument form stays for the previously deployed build');
  assert.ok(!/chat_append_message\([^)]*p_metadata jsonb default/.test(compact),
    'the seven-argument form must not declare defaults, or six-argument calls become ambiguous');
  assert.match(compact, /create or replace function public\.chat_get_thread\(p_thread_id uuid\) returns jsonb/);
});

test('new RPCs are revoked from public/anon and granted only to authenticated', () => {
  const revoke = compact.slice(compact.indexOf('revoke all on function'), compact.indexOf('grant execute on function'));
  const grant = compact.slice(compact.indexOf('grant execute on function'));
  assert.match(revoke, /from public, anon;/);
  assert.match(grant, /to authenticated;/);
  for (const signature of [
    'chat_update_space(uuid,text,text,boolean)',
    'chat_update_thread(uuid,text,boolean,boolean)',
    'chat_search(text,integer)',
    'chat_usage()',
    'chat_append_message(uuid,uuid,text,text,text,jsonb,jsonb)',
  ]) {
    assert.ok(revoke.includes(`public.${signature}`), signature);
    assert.ok(grant.includes(`public.${signature}`), signature);
  }
});

test('migration search, usage and thread detail payloads match the UI contract', () => {
  assert.match(compact, /'metadata', m\.metadata/);
  assert.match(compact, /left\(m2\.body, 120\)/);
  assert.match(compact, /kinnso_internal\.chat_turn_budget/);
  for (const key of ['used', 'limit', 'resetAt', 'spaces', 'threads', 'messages']) {
    assert.ok(compact.includes(`'${key}'`), key);
  }
  const archivedFilters = compact.match(/archived_at is null/g) ?? [];
  assert.ok(archivedFilters.length >= 2, 'space and chat lists must hide archived rows');
  assert.match(compact, /pinned_at desc nulls last/);
});

test('the studio chat 2 API routes keep the conversation gate and validation', () => {
  const routes = {
    'app/api/spaces/[spaceId]/route.ts': [
      "apiContext(request, 'conversation', true)",
      'export async function PATCH',
      'parseSpaceUpdate',
    ],
    'app/api/spaces/[spaceId]/chats/[threadId]/route.ts': [
      "apiContext(request, 'conversation', true)",
      'export async function PATCH',
      'parseThreadUpdate',
    ],
    'app/api/spaces/search/route.ts': [
      "apiContext(request, 'conversation')",
      'export async function GET',
      'searchQuery',
      'searchLimit',
    ],
    'app/api/spaces/usage/route.ts': [
      "apiContext(request, 'conversation')",
      'export async function GET',
      'usage()',
    ],
    'app/api/spaces/[spaceId]/chats/[threadId]/messages/route.ts': [
      "apiContext(request, 'conversation', true)",
      'regenerateRequested',
      'assistantMetadata',
      "type: 'done'",
      'metadata',
    ],
  };
  for (const [file, needles] of Object.entries(routes)) {
    const source = read(file);
    for (const needle of needles) assert.ok(source.includes(needle), `${file} must include ${needle}`);
  }
});

test('chat server helpers expose update, search, usage and metadata append', () => {
  const server = read('lib/chat/server.ts');
  for (const needle of [
    'export function updateSpace',
    'export function updateThread',
    'export async function searchChats',
    'export async function usage',
    'p_metadata: metadata',
  ]) assert.ok(server.includes(needle), needle);
  const messages = read('app/api/spaces/[spaceId]/chats/[threadId]/messages/route.ts');
  assert.ok(messages.includes('const regenerateFrom = regenerate ? lastUserIndex(thread.messages) : -1'));
  assert.ok(messages.includes('assistantMetadata(result, performance.now() - turnStartedAt)'));
  assert.ok(messages.includes('if (!regenerate) {'));
  assert.ok(messages.includes('appendMessage(threadId, assistantRequestId, \'assistant\''));
});

test('the chat turn surfaces tool sources on the done tool event, the final event and the return value', () => {
  const turn = read('lib/ai/spaces-chat.ts');
  assert.ok(turn.includes("import { mergeToolSources, toolSources } from '../chat/contracts';"));
  assert.ok(turn.includes('const collectedSources: ChatToolSource[][] = [];'));
  assert.ok(turn.includes('const sources = toolSources(structured);'));
  assert.ok(turn.includes("...(sources.length ? { sources } : {})"));
  assert.ok(turn.includes("type: 'final', text: finalText, tools: toolTraces, model: config.modelId, sources"));
  assert.ok(turn.includes('return { text, tools: toolTraces, model: \'none:tool-grounded\', sources: mergeToolSources(collectedSources) };'));
  assert.ok(turn.includes("return { text: finalText, tools: toolTraces, model: config.modelId, sources };"));
});
