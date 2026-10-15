// Regression cover for the traveller "search → bookmark" recovery paths in
// GuideWorkspace. The component handlers, effects and state transitions below
// are the real ones; only the session/network/framework boundaries are doubles,
// matching tests/helpers/workspace-harness.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {build} = require('esbuild');

const STUBS = {
  ui: `export const useApp=()=>({locale:globalThis.__locale,t:(en,zh)=>globalThis.__locale==='zh-HK'?zh:en,href:p=>'/'+globalThis.__locale+'/'+(p||'')});`,
  guides: `export const guides={get:id=>globalThis.__ports.guidesGet(id)};`,
  adoption: `export const adoptionPreview=()=>null;`,
  bookmarks: `export const bookmarks={list:(...a)=>globalThis.__ports.bookmarksList(...a),toggle:(...a)=>globalThis.__ports.bookmarksToggle(...a)};`,
  trips: `export const trips={list:async()=>({ok:true,data:{items:[],nextCursor:null}}),get:async()=>({ok:false,code:'NOT_FOUND',retryable:false,requestId:'x'}),adopt:async()=>({ok:false,code:'UNAVAILABLE',retryable:true,requestId:'x'})};`,
  drafts: `export const subscribeAccountInvalidation=()=>()=>{};export const invalidateAccountViews=()=>{};`,
  guest: `export const GuestPlanner=()=>null;`,
  content: `export const PublicGuideContent=({guide})=>guide?guide.title:'';`,
  guard: `export const useDraftNavigation=()=>()=>{};`,
};

function stubFor(specifier) {
  if (specifier.endsWith('/guides/repository')) return 'guides';
  if (specifier.endsWith('/guides/adoption-preview')) return 'adoption';
  if (specifier.endsWith('/bookmarks/repository')) return 'bookmarks';
  if (specifier.endsWith('/trips/repository')) return 'trips';
  if (specifier.endsWith('/trips/local-drafts')) return 'drafts';
  if (specifier === './ui') return 'ui';
  if (specifier === './GuestPlanner') return 'guest';
  if (specifier.endsWith('/seo/PublicGuideContent')) return 'content';
  if (specifier === './UnsavedDraftGuard') return 'guard';
  return null;
}

let bundlePromise;
function bundle() {
  bundlePromise ??= build({
    entryPoints: [new URL('../app/travel/GuideWorkspace.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/jsx-runtime', 'next/link', 'next/navigation'],
    plugins: [{
      name: 'boundary-ports',
      setup(b) {
        b.onResolve({filter: /.*/}, args => {
          const key = stubFor(args.path);
          return key ? {path: key, namespace: 'stub'} : null;
        });
        b.onLoad({filter: /.*/, namespace: 'stub'}, args => ({loader: 'js', contents: STUBS[args.path]}));
      },
    }],
  });
  return bundlePromise;
}

const tick = () => new Promise(resolve => setImmediate(resolve));

/**
 * Renders one exported component from the real GuideWorkspace module with a
 * minimal React double, returning helpers that read the produced element tree.
 */
async function mount(name, props, ports, search = '') {
  const states = [], refs = [], effects = [], listeners = new Map();
  let cursor = 0, tree, changed = false, sequence = 0;
  const noop = () => {};
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => {
        const next = typeof value === 'function' ? value(states[i]) : value;
        if (!Object.is(states[i], next)) { states[i] = next; changed = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return refs[i] ?? (refs[i] = {current: initial}); },
    useEffect(work, deps) {
      const i = cursor++, previous = effects[i];
      if (!previous || !deps || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
        effects[i] = {deps, work, pending: true, cleanup: previous?.cleanup};
      }
    },
  };
  const jsx = (type, jsxProps) => typeof type === 'function' ? type(jsxProps) : ({type, props: jsxProps});
  // Stable across renders: the component's reset effect depends on the router
  // identity, so a fresh object per render would re-run it endlessly.
  const router = {push: noop, replace: noop, refresh: noop};
  const searchParams = new URLSearchParams(search);
  const context = createContext({
    module: {}, exports: {}, console, setTimeout, clearTimeout, URL, URLSearchParams,
    crypto: {randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`},
    document: {visibilityState: 'visible', addEventListener: noop, removeEventListener: noop},
    navigator: {onLine: true},
    window: {location: {pathname: `/${'en'}/g/demo`, search, hash: ''}},
    __locale: props.locale ?? 'en',
    __search: search,
    __ports: ports,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'fragment'};
      if (name === 'next/link') return {__esModule: true, default: 'a'};
      if (name === 'next/navigation') {
        return {
          useRouter: () => router,
          useSearchParams: () => searchParams,
        };
      }
      return require(name);
    },
  });
  context.globalThis = context;
  const compiled = await bundle();
  const module = {exports: {}};
  context.module = module;
  context.exports = module.exports;
  runInContext(compiled.outputFiles[0].text, context);

  const render = () => {
    for (let pass = 0; pass < 15; pass++) {
      cursor = 0; changed = false;
      tree = module.exports[name](props);
      for (const effect of effects) if (effect?.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.work(); }
      if (!changed) break;
    }
    return tree;
  };
  const elements = (node = tree) => !node || typeof node !== 'object' ? [] :
    (Array.isArray(node) ? node.flatMap(elements) : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]);
  const text = (node = tree) => typeof node === 'string' || typeof node === 'number' ? String(node)
    : node && typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join(' ') : '';
  const settle = async () => { for (let n = 0; n < 4; n++) { await tick(); render(); } };

  render();
  await settle();
  return {
    render, settle, elements: () => elements(), text: () => text(),
    button: label => elements().find(node => node.type === 'button' && text(node).includes(label)),
    listen: (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
  };
}

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
