import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {capabilities} from '../lib/contracts/capabilities.ts';

// Exercise the actual server route and route validator without starting Next or contacting Auth.
function load(file, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
  });
  const exports = {};
  new Function('require', 'exports', 'process', outputText)(
    name => dependencies[name] ?? {}, exports, {env: {}},
  );
  return exports;
}

const notFound = () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); };
const Workbench = Symbol('Workbench');
const jsx = (type, props) => ({type, props});
const routes = load('../app/travel/routes.ts', {'./model': {fixtures: []}});
const {default: Page} = load('../app/[locale]/[[...route]]/page.tsx', {
  react: {cache: fn => fn, Suspense: Symbol('Suspense')},
  'react/jsx-runtime': {jsx},
  'next/navigation': {notFound},
  '../../travel/Workbench': {Workbench},
  '../../travel/routes': routes,
  '../../../lib/auth/actor': {currentActor: async () => null},
  '../../../lib/contracts/capabilities': {capabilities},
  '../../../lib/seo/public-routes': {parsePublicRoute: () => null, isPublicRouteNamespace: () => false},
});
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

test('the ops pilot query preserves the canonical Ops entry and its independent gates', async () => {
  const {props: {children}} = await render('en', ['ops'], {view:'pilot'});
  assert.equal(children.type, Workbench);
  assert.equal(children.props.path, 'ops');
  assert.equal(children.props.features.ops, false);
  assert.equal(children.props.features.pilot, false);
});
