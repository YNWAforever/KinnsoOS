import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {capabilities} from '../lib/contracts/capabilities.ts';

// Exercise the actual server route and route validator without starting Next or contacting Auth.
function load(file, dependencies, env={}, window) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
  });
  const exports = {};
  new Function('require', 'exports', 'process', 'window', outputText)(
    name => dependencies[name] ?? {}, exports, {env}, window,
  );
  return exports;
}

const notFound = () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); };
const Workbench = Symbol('Workbench');
const jsx = (type, props) => ({type, props});
const routes = load('../app/travel/routes.ts', {'./model': {fixtures: []}});
const pageDependencies = {
  react: {cache: fn => fn, Suspense: Symbol('Suspense')},
  'react/jsx-runtime': {jsx},
  'next/navigation': {notFound},
  '../../travel/Workbench': {Workbench},
  '../../travel/routes': routes,
  '../../../lib/auth/actor': {currentActor: async () => null},
  '../../../lib/contracts/capabilities': {capabilities},
  '../../../lib/seo/public-routes': {parsePublicRoute: () => null, isPublicRouteNamespace: () => false, readLiveArticles: () => false, readLiveSessions: () => false, bareNamespaceIsPublicEntry: () => false},
};
const {default: Page} = load('../app/[locale]/[[...route]]/page.tsx',pageDependencies);
const render = (locale, route, searchParams = {}) =>
  Page({params: Promise.resolve({locale, route}), searchParams: Promise.resolve(searchParams)});

test('both locale entries pass the exact pilot path and disabled flag to Workbench', async () => {
  for (const locale of ['en', 'zh-HK']) {
    const {props: {children}} = await render(locale, ['pilot']);
    assert.equal(children.type, Workbench);
    assert.equal(children.props.locale, locale);
    assert.equal(children.props.path, 'pilot');
    assert.equal(children.props.features.pilot, false);
  }
});

test('unknown pilot paths, demo alias, and unsupported locale return 404', async () => {
  for (const [locale, route] of [['en', ['pilot','unknown']], ['en', ['demo','pilot']], ['fr', ['pilot']]]) {
    await assert.rejects(render(locale, route), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
});

const connected = {
  KINNSO_SUPABASE_URL: 'https://example.supabase.co',
  KINNSO_APPROVED_SUPABASE_ORIGIN: 'https://example.supabase.co',
  KINNSO_LEGACY_AUTH_ORIGIN: 'https://example.supabase.co',
  KINNSO_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
};
const operator = {id: 'operator', roles: ['ops']};
const ordinary = {id: 'participant', roles: []};
const unavailable = async () => ({ok:false, code:'FORBIDDEN'});
const tick = () => new Promise(resolve => setImmediate(resolve));

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  return node?.props ? [node, ...elements(node.props.children)] : [];
}

// Drive effects and state at the actual component boundaries. Only Next's
// router/dynamic loading, unrelated UI, and external repositories are stubbed.
async function integration({locale='en', route, query='', flags='trips,ops,pilot', actor=operator,
  participantRead=unavailable, controlRead=unavailable} = {}) {
  const reads = [], listeners = new Set();
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const search = new URLSearchParams(query);
  const useApp = () => ({locale, t:(en, zh) => locale==='en' ? en : zh, href:path => '/'+locale+'/'+path});
  const jsx = (type, props) => ({type, props});
  let frame;
  const react = {
    cache: fn => fn, Suspense: Symbol('Suspense'),
    useState(initial) {
      const f=frame, i=f.cursor++;
      if (!(i in f.slots)) f.slots[i]=typeof initial==='function' ? initial() : initial;
      return [f.slots[i], value => {
        const next=typeof value==='function' ? value(f.slots[i]) : value;
        if (!Object.is(f.slots[i], next)) { f.slots[i]=next; f.dirty=true; }
      }];
    },
    useRef(initial) {
      const f=frame, i=f.cursor++;
      return f.slots[i] ??= {current:initial};
    },
    useEffect(run, deps) {
      const f=frame, i=f.cursor++, old=f.slots[i];
      if (!old || deps.some((v,j) => !Object.is(v,old.deps[j]))) {
        f.slots[i]={deps, cleanup:old?.cleanup};
        f.effects.push(() => { old?.cleanup?.(); f.slots[i].cleanup=run(); });
      }
    },
  };
  function mount(node) {
    const f={slots:[]};
    return {
      render(props=node.props) {
        let tree;
        for (let i=0;i<10;i++) {
          Object.assign(f,{cursor:0, dirty:false, effects:[]});
          frame=f;
          tree=node.type(props);
          frame=null;
          f.effects.forEach(run => run());
          if (!f.dirty) return tree;
        }
        throw Error('Component did not settle: '+node.type.name);
      },
      unmount() { f.slots.forEach(slot => slot?.cleanup?.()); },
    };
  }
  const ops = Object.fromEntries(['queue','summary','routing'].map(name => [name, (...args) => {
    reads.push(['ops.'+name,...args]); return unavailable();
  }]));
  const pilot = {
    selectActor() {}, hasPending:()=>false, subscribeInvalidation:subscribe,
    get: (...args) => { reads.push(['participant',...args]); return participantRead(...args); },
  };
  const opsPilot = {
    selectActor() {}, pending:()=>null,
    get: (...args) => { reads.push(['control',...args]); return controlRead(...args); },
  };
  const common = {
    react, 'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:Symbol('Fragment')},
    'next/link':{__esModule:true,default:'a'},
    'next/dynamic':{__esModule:true,default:resolve => ({resolve})},
    'next/navigation':{notFound, useSearchParams:()=>search, useRouter:()=>({})},
    './ui':{AppContext:{Provider:Symbol('Provider')},useApp}, '../ui':{useApp},
    './model':{blank:()=>({})}, './routes':routes,
    '../integration/public-entry-registry':{isPublicEntryPath:()=>false},
    './UnsavedDraftGuard':{useDraftNavigation:()=>()=>{}},
    '../../lib/trips/local-drafts':{subscribeAccountInvalidation:subscribe},
    '../../../lib/trips/local-drafts':{subscribeAccountInvalidation:subscribe},
    '../../lib/ops/repository':{ops}, '../../../lib/ops/repository':{ops},
    '../../lib/ops/queue-filters':{readQueueFilter:()=>({}),queueFilterPath:()=>'/'+locale+'/ops'},
    '../../../lib/pilot/repository':{pilot,opsPilot},
  };
  const participant = load('../app/travel/pilot/PilotWorkspace.tsx',common);
  const control = load('../app/travel/pilot/PilotControlRoom.tsx',common);
  const coordinator = load('../app/travel/OpsWorkspace.tsx',{...common,'./pilot/PilotControlRoom':control}, {}, {location:{search:query}});
  const workbench = load('../app/travel/Workbench.tsx',{
    ...common,'./pilot/PilotWorkspace':participant,'./OpsWorkspace':coordinator,
  });
  const {default: page} = load('../app/[locale]/[[...route]]/page.tsx',{
    ...pageDependencies,...common,'../../travel/Workbench':workbench,
    '../../../lib/auth/actor':{currentActor:async()=>actor},
  }, {...connected,KINNSO_ENABLED_CAPABILITIES:flags});
  const {props:{children}} = await page({
    params:Promise.resolve({locale,route}), searchParams:Promise.resolve(Object.fromEntries(search)),
  });
  const root=mount(children);
  async function branch(tree, component) {
    for (const node of elements(tree)) {
      const type=node.type?.resolve ? await node.type.resolve() : node.type;
      if (type===component) return {...node,type};
    }
    return null;
  }
  return {
    root, reads, mount, branch, ...participant, ...control, ...coordinator,
    invalidate(next) { for (const fn of [...listeners]) fn(next); },
  };
}

test('connected canonical entry mounts the real participant workspace in both locales', async () => {
  for (const [locale,heading] of [['en','Pilot participation'],['zh-HK','試行計劃參與']]) {
    const h=await integration({locale,route:['pilot'],actor:ordinary,flags:'pilot'});
    const node=await h.branch(h.root.render(),h.PilotWorkspace);
    const session=h.mount(h.mount(node).render());
    assert.ok(elements(session.render()).some(x => x.type==='h1' && x.props.children===heading));
    assert.deepEqual(h.reads.map(r=>r.slice(0,2)),[['participant',ordinary.id]]);
    session.unmount();
  }
});

test('only exact Ops pilot query starts control-room reads, with both gates and an actor', async () => {
  for (const [route,query,flags,actor,expected] of [
    [['ops'],'view=pilot&id=selected','ops,pilot',operator,'Loading pilot…'],
    [['ops'],'view=pilot','ops',operator,'Operations services are disconnected.'],
    [['ops'],'view=pilot','pilot',operator,'Operations services are disconnected.'],
    [['ops'],'view=pilot','ops,pilot',null,'Sign in to continue'],
    [['ops','missions'],'view=pilot','ops,pilot',ordinary,null],
    [['ops'],'view=reviews','ops,pilot',ordinary,null],
  ]) {
    const h=await integration({route,query,flags,actor});
    const coordinator=h.mount(await h.branch(h.root.render(),h.OpsWorkspace)).render();
    const room=await h.branch(coordinator,h.PilotControlRoom);
    if (expected===null) {
      assert.equal(room,null);
      assert.ok(!h.reads.some(([name])=>name==='control'));
      continue;
    }
    assert.ok(room, 'exact Ops pilot query must delegate to the control room');
    const session=h.mount(h.mount(room).render());
    assert.ok(elements(session.render()).some(x=>x.props.children===expected),expected);
    assert.deepEqual(h.reads, expected==='Loading pilot…'
      ? [['control','selected',operator.id],['ops.routing']] : []);
    session.unmount();
  }
});

test('unavailable or signed-out participant entry makes no private read', async () => {
  for (const [flags,actor,expected] of [
    ['trips',ordinary,'Pilot participation is unavailable.'],
    ['pilot',null,'Sign in to continue'],
  ]) {
    const h=await integration({route:['pilot'],flags,actor});
    const node=await h.branch(h.root.render(),h.PilotWorkspace);
    const tree=h.mount(h.mount(node).render()).render();
    assert.ok(elements(tree).some(x=>x.props.children===expected));
    assert.deepEqual(h.reads,[]);
  }
});

test('ordinary account has no pilot navigation on home or in the denied Ops queue', async () => {
  for (const route of [[],['ops']]) {
    const h=await integration({route,actor:ordinary});
    const tree=h.root.render();
    const entry=await h.branch(tree,h.OpsWorkspace);
    const queue=entry && h.mount(entry);
    queue?.render();
    await tick();
    for (const {props:{href}} of elements([tree,queue?.render()]).filter(x=>x.type==='a')) {
      const url=new URL(href,'https://example.test');
      assert.ok(!url.pathname.endsWith('/pilot') && url.searchParams.get('view')!=='pilot',href);
      assert.notEqual(url.hostname,'remix-kinnso-web.vercel.app');
    }
  }
});

test('account invalidation aborts a pending participant read and clears Workbench actor scope', async () => {
  let resolve;
  const h=await integration({route:['pilot'],actor:ordinary,participantRead:()=>new Promise(r=>{resolve=r;})});
  const node=await h.branch(h.root.render(),h.PilotWorkspace);
  const session=h.mount(h.mount(node).render());
  session.render();
  const signal=h.reads[0][2];
  assert.equal(signal.aborted,false);
  h.invalidate('replacement');
  session.render();
  assert.equal(signal.aborted,true);
  resolve({ok:false,code:'UNAVAILABLE'});
  await tick();
  const next=await h.branch(h.root.render(),h.PilotWorkspace);
  assert.equal(next.props.actorId,null);
  const signedOut=h.mount(h.mount(next).render()).render();
  assert.ok(elements(signedOut).some(x=>x.props.children==='Sign in to continue'));
  assert.ok(!elements(session.render()).some(x=>x.props.role==='alert'));
  assert.equal(h.reads.length,1);
});

test('account invalidation discards a pending control-room result and clears the Ops actor', async () => {
  let resolve;
  const h=await integration({route:['ops'],query:'view=pilot',
    controlRead:()=>new Promise(r=>{resolve=r;})});
  const coordinator=h.mount(await h.branch(h.root.render(),h.OpsWorkspace));
  const room=await h.branch(coordinator.render(),h.PilotControlRoom);
  const session=h.mount(h.mount(room).render());
  session.render();
  assert.deepEqual(h.reads,[['control',undefined,operator.id],['ops.routing']]);
  h.invalidate('replacement');
  resolve({ok:false,code:'NOT_FOUND'});
  await tick();
  const staleSession=elements(session.render());
  assert.ok(staleSession.some(x=>x.props.children==='Sign in to continue'));
  assert.ok(!staleSession.some(x=>x.props.role==='alert'));
  const next=await h.branch(h.root.render(),h.OpsWorkspace);
  const signedOut=await h.branch(coordinator.render(next.props),h.PilotControlRoom);
  assert.equal(signedOut.props.actorId,null);
  h.mount(h.mount(signedOut).render()).render();
  assert.equal(h.reads.length,2);
});
