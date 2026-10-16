// Regression cover for the traveller "search → bookmark" recovery paths in
// GuideWorkspace. The component handlers, effects and state transitions below
// are the real ones; only the session/network/framework boundaries are doubles,
// matching tests/helpers/workspace-harness.mjs.
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {build} = require('esbuild');

const STUBS = {
  ui: `export const useApp=()=>({ready:true,locale:globalThis.__locale,t:(en,zh)=>globalThis.__locale==='zh-HK'?zh:en,href:p=>'/'+globalThis.__locale+'/'+(p||'')});`,
  guides: `export const guides={get:id=>globalThis.__ports.guidesGet(id)};`,
  adoption: `export const adoptionPreview=(...a)=>globalThis.__ports.adoptionPreview?.(...a)??null;`,
  bookmarks: `export const bookmarks={list:(...a)=>globalThis.__ports.bookmarksList(...a),toggle:(...a)=>globalThis.__ports.bookmarksToggle(...a)};`,
  trips: `export const trips={list:(...a)=>globalThis.__ports.tripsList?.(...a)??Promise.resolve({ok:true,data:{items:[],nextCursor:null}}),get:(...a)=>globalThis.__ports.tripsGet?.(...a)??Promise.resolve({ok:false,code:'NOT_FOUND',retryable:false,requestId:'x'}),adopt:(...a)=>globalThis.__ports.tripsAdopt?.(...a)??Promise.resolve({ok:false,code:'UNAVAILABLE',retryable:true,requestId:'x'}),create:(...a)=>globalThis.__ports.tripsCreate?.(...a),creation:(...a)=>globalThis.__ports.creationReceipt?.(...a)??Promise.resolve({ok:true,data:{tripId:null}})};`,
  drafts: `export const subscribeAccountInvalidation=(...a)=>globalThis.__ports.subscribeInvalidation?.(...a)??(()=>{});export const invalidateAccountViews=(...a)=>globalThis.__ports.invalidateAccount?.(...a);
   export const synchronizeAccountCache=async()=>{};
   export const readPendingAdoption=async(...a)=>globalThis.__ports.readPending?.(...a)??null;
   export const savePendingAdoption=async(...a)=>globalThis.__ports.savePending?.(...a);
   export const clearPendingAdoption=async(...a)=>globalThis.__ports.clearPending?.(...a);
   export const readPendingCreation=async(...a)=>globalThis.__ports.readCreation?.(...a)??null;
   export const savePendingCreation=async(...a)=>globalThis.__ports.saveCreation?.(...a);
   export const recordCreatedTrip=async(...a)=>globalThis.__ports.recordCreated?.(...a);
   export const clearPendingCreation=async(...a)=>globalThis.__ports.clearCreation?.(...a);
   export const restoreOriginalCreation=async(...a)=>globalThis.__ports.restoreCreation?.(...a);
   export const saveLocalSnapshot=async()=>{};export const readLocalSnapshot=async()=>null;
   export const saveLocalDraft=async()=>{};export const readLocalDraft=async()=>null;export const clearLocalDraft=async()=>{};`,
  guest: `export const GuestPlanner=()=>null;`,
  content: `export const PublicGuideContent=({guide})=>guide?guide.title:'';`,
  guard: `export const useDraftNavigation=()=>path=>globalThis.__ports.navigate?.(path);`,
  metrics: `export const trackPilotEvent=(...args)=>globalThis.__ports.trackPilotEvent?.(...args);`,
  children: `export const ImportPreview=()=>null;export const RecordCapture=()=>null;export const SharePreview=()=>null;export const TripWarnings=()=>null;export const PendingAdoptionRecovery=()=>null;export const exportPrivateTrip=()=>{};`,
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
  if (specifier.endsWith('/telemetry/pilot-client')) return 'metrics';
  if (['./ImportPreview','./RecordCapture','./SharePreview','./TripWarnings','./PendingAdoptionRecovery'].includes(specifier)||specifier.endsWith('/trips/export')) return 'children';
  return null;
}

const bundles=new Map();
function bundle(name) {
  const file=name==='TripWorkspace'?'TripWorkspace':'GuideWorkspace';
  if(!bundles.has(file))bundles.set(file,build({
    entryPoints: [new URL('../../app/travel/'+file+'.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
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
  }));
  return bundles.get(file);
}

const tick = () => new Promise(resolve => setImmediate(resolve));

/**
 * Renders one exported component from the real GuideWorkspace module with a
 * minimal React double, returning helpers that read the produced element tree.
 */
export async function mount(name, props, ports, search = '') {
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
    module: {}, exports: {}, console, Error, setTimeout, clearTimeout, URL, URLSearchParams,
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
      if (name === 'next/link') return 'a';
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
  const compiled = await bundle(name);
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
  function elements(node){
    if(arguments.length===0)node=tree;
    return !node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(elements):[node,...[node.props?.children].flat(Infinity).flatMap(elements)];
  }
  function text(node){
    if(arguments.length===0)node=tree;
    return typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(text).join(' '):'';
  }
  const settle = async () => { for (let n = 0; n < 4; n++) { await tick(); render(); } };

  render();
  await settle();
  return {
    render, settle, elements: () => elements(), text: () => text(),
    button: label => elements().find(node => node.type === 'button' && text(node).includes(label)),
    listen: (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
  };
}
