import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {existsSync, createWriteStream} from 'node:fs';
import {execFileSync, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnvFile} from 'node:process';
import lighthouse from './node_modules/lighthouse/core/index.js';
import puppeteer from './node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {chromium} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {transform} from 'esbuild';
import {verifyTestTarget} from '../verify-test-target.mjs';
import {assessRun, compareLab, localOrigin, retainNavigation, foundationRevision} from './report.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const foundationSha = foundationRevision;
const foundation = process.argv.includes('--foundation');
const probeTrip = process.argv.includes('--probe-trip');
const origin = localOrigin(foundation ? 'http://127.0.0.1:3522' : 'http://127.0.0.1:3521');
const buildApp = foundation ? path.join(app, 'evidence/performance/foundation') : app;
const out = path.join(app, 'evidence/performance', `${foundation ? 'foundation' : 'current'}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(out, {recursive: true});
loadEnvFile(path.join(app, '.env.test'));
const target = verifyTestTarget();
const db = JSON.parse(execFileSync('docker', ['inspect', target.dbContainer], {encoding: 'utf8'}))[0];
if (!db.State.Running || db.Config.Labels['com.supabase.cli.project'] !== target.projectRef)
  throw Error('Owned isolated database required before reading local credentials');
if (!existsSync(path.join(buildApp, '.next/BUILD_ID'))) throw Error('Build the selected local app before measuring');
if (foundation && (await readFile(path.join(buildApp, 'FOUNDATION_SHA'), 'utf8')).trim() !== foundationSha)
  throw Error('Foundation must be the frozen source archive');
// Refuse an occupied port: this runner never attaches to or terminates somebody else's server.
const {createServer} = await import('node:net');
await new Promise((resolve, reject) => {
  const probe = createServer(); probe.once('error', reject);
  probe.listen(Number(new URL(origin).port), '127.0.0.1', () => probe.close(resolve));
});
const environment = {...process.env, KINNSO_ENVIRONMENT: 'local', KINNSO_SITE_URL: origin,
  KINNSO_MEDIA_RUNTIME: 'unified', KINNSO_SUPABASE_SECRET_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY};
const serverLog = createWriteStream(path.join(out, 'server.log'));
const server = spawn(process.execPath, [path.join(buildApp, 'node_modules/next/dist/bin/next'),
  'start', '--hostname', '127.0.0.1', '--port', new URL(origin).port],
  {cwd: buildApp, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
server.stdout.pipe(serverLog); server.stderr.pipe(serverLog);
let browser, admin, actor, fixture;
const ownedActors = [], samples = [], interactions = [], blockedOrigins = new Set();
const report = {schemaVersion: 1,kind:foundation?'foundation':'current', environment: 'owned isolated local production build',
  sourceSha: foundation ? foundationSha : execFileSync('git', ['rev-parse', 'HEAD'], {cwd: app, encoding: 'utf8'}).trim(),
  sourceDiff: execFileSync('git', ['diff', '--name-only'], {cwd: app, encoding: 'utf8'}).trim().split('\n').filter(Boolean),
  conditions: null, samples, interactions, notComparable: foundation ? ['guide', 'trip'] : [],
  limitations: ['Lab navigation and interaction results are not field INP or cloud API/query p95.',
    'Cold means cleared browser HTTP cache in a fresh context; signed-in cookies are retained. Server/database stay warm.',
    'No external HTTP requests allowed. Synthetic guide has no image; image bytes of zero do not measure a real cover.',
    'Foundation guide/trip use demo data; they are not functional persistence comparisons. Home/explore data also differ.'],
  queryLatency: {status: 'NOT_MEASURED', reason: 'No server query trace is collected by this browser lab'},
  cleanup: 'PENDING'};
function checked(result) { if (result.error) throw Error(result.error.message); return result.data; }
async function setup() {
  admin = createClient(target.apiOrigin, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  const email = `synthetic-lab-${randomUUID()}@example.test`, password = `Lab!${randomUUID()}`;
  const user = checked(await admin.auth.admin.createUser({email, password, email_confirm: true})).user;
  ownedActors.push(user.id);
  checked(await admin.from('creators').update({status: 'active', display_name: 'Synthetic lab author'}).eq('id', user.id));
  actor = createClient(target.apiOrigin, process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
  checked(await actor.auth.signInWithPassword({email, password}));
  const guide = checked(await actor.from('guides').insert({creator_id: user.id, creator_name: 'Synthetic lab author',
    creator_handle: 'synthetic', slug: 'synthetic-lab-'+randomUUID(), title: 'Synthetic mobile lab guide',
    summary: 'One explicitly authored day for isolated performance measurements.', cover_url: '', city: 'Kyoto',
    status: 'published', published_at: new Date().toISOString()}).select('id').single());
  checked(await actor.rpc('publish_guide_version', {p_guide_id: guide.id, p_expected_version: 0, p_request_id: randomUUID(),
    p_content: {days: [{offset: 0, title: 'Authored lab day', stops: [{title: 'Authored lab stop', description: 'Public authored instruction',
      placeId: null, startMinuteOfDay: 600, durationMinutes: 30}]}]}}));
  let trip = checked(await actor.rpc('create_trip_v2', {p_request_id: randomUUID(), p_payload: {title: 'Synthetic mobile lab trip', timezone: 'UTC'}}));
  trip = checked(await actor.rpc('adopt_guide_to_trip', {p_guide_id: guide.id, p_version: 1, p_trip_id: trip.id,
    p_expected_revision: trip.revision, p_request_id: randomUUID()}));
  return {email, password, guideId: guide.id, tripId: trip.id};
}
const flags = {logLevel: 'error', onlyCategories: ['performance'], disableStorageReset: true,
  throttlingMethod: 'devtools', formFactor: 'mobile',
  screenEmulation: {mobile: true, width: 390, height: 844, deviceScaleFactor: 1, disabled: false},
  throttling: {requestLatencyMs: 150, downloadThroughputKbps: 1600, uploadThroughputKbps: 750, cpuSlowdownMultiplier: 4},
  maxWaitForLoad: 45000};
async function button(page, text) {
  const found = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label), text);
  const element = found.asElement(); if (!element) throw Error('Missing button '+text);
  await element.evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));
  await page.waitForFunction(label=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
    if(!el||el.disabled)return false;const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);},{},text);
  await element.click(); await found.dispose();
}
async function input(page, label, value) {
  const handle = await page.evaluateHandle(text => {
    const l = [...document.querySelectorAll('label')].find(l => l.textContent.trim() === text);
    return l?.control ?? l?.querySelector('input,textarea');
  }, label);
  const element = handle.asElement(); if (!element) throw Error('Missing input '+label);
  await element.evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));
  await element.click({clickCount: 3}); await element.press('Backspace'); await element.type(value); await handle.dispose();
}
async function guardPage(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (['data:', 'blob:', 'about:'].includes(url.protocol) ||
        (url.protocol === 'http:' && url.hostname === '127.0.0.1' && [new URL(origin).port, '58421'].includes(url.port)))
      void request.continue();
    else {blockedOrigins.add(url.origin); void request.abort('blockedbyclient');}
  });
}
async function ready(page, kind) {
  if (foundation) {
    await page.waitForSelector('h1');
    if (kind==='trip') await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Synthetic foundation demo trip');
    return;
  }
  if (kind === 'home' || kind === 'explore') await page.waitForFunction(() => document.body.textContent.includes('Synthetic mobile lab guide'));
  else if (kind === 'guide') await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Plan as a device-only draft'));
  else await page.waitForSelector('textarea[id^="note-"]');
}
function traceWithoutArguments(trace) {
  return {traceEvents: trace.traceEvents.map(({args, ...event}) => event),
    redaction: 'All event arguments omitted; actual categories/timestamps/durations retained. No network headers or credentials exported.'};
}
async function navigation(page, kind, route, cache, run) {
  const result = await lighthouse(origin+route, flags, undefined, page);
  const lhr = result.lhr;
  const requests = lhr.audits['network-requests']?.details?.items ?? [];
  const bytes = type => requests.filter(r => r.resourceType === type).reduce((sum,r) => sum+(r.transferSize ?? 0),0);
  const metrics = key => lhr.audits[key]?.numericValue ?? null;
  const finalPath = new URL(lhr.finalDisplayedUrl ?? lhr.finalUrl ?? origin).pathname;
  const main = requests.find(r => r.resourceType === 'Document' && new URL(r.url).pathname === route);
  const sample = {page: kind, route, cache, run, status: main?.statusCode ?? null,
    verified: false, lcpMs: metrics('largest-contentful-paint'), cls: metrics('cumulative-layout-shift'),
    tbtMs: metrics('total-blocking-time'), jsTransferBytes: bytes('Script'), imageTransferBytes: bytes('Image'),
    api: requests.filter(r => new URL(r.url).pathname.startsWith('/api/')).map(r => ({path: new URL(r.url).pathname,
      durationMs: r.networkEndTime-r.networkRequestTime, status: r.statusCode})),
    auditErrors: Object.entries(lhr.audits).filter(([,audit]) => audit.errorMessage).map(([audit,value]) => ({audit,error:value.errorMessage})),
    reportFile: `${kind}-${run}-${cache}.lhr.json`, traceFile: `${kind}-${run}-${cache}.trace.json`};
  samples.push(sample);
  try {
    await retainNavigation(result,async value=>{
      await writeFile(path.join(out,sample.reportFile),JSON.stringify(value.lhr));
      if(value.artifacts?.Trace)await writeFile(path.join(out,sample.traceFile),JSON.stringify(traceWithoutArguments(value.artifacts.Trace)));
      else throw Error('Navigation trace missing');
    },async()=>{await ready(page,kind);sample.verified=finalPath===route;});
  }catch(error){sample.failure=error.message;throw error;}
  finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
  console.log(`${kind} ${run} ${cache}: LCP=${sample.lcpMs?.toFixed(0)}ms CLS=${sample.cls} TBT=${sample.tbtMs?.toFixed(0)}ms`);
}
async function interaction(page, kind) {
  const session = await page.createCDPSession();
  await session.send('Emulation.setCPUThrottlingRate', {rate: 4});
  await session.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: 1600*1024/8, uploadThroughput: 750*1024/8});
  await page.evaluate(() => performance.clearResourceTimings());
  await session.send('Tracing.start', {categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream'});
  const started = performance.now();
  let assertion;
  try {
    if (kind === 'home') {
      await input(page, 'Destination or interest', 'Kyoto');
      await Promise.all([page.waitForNavigation(), button(page, 'Find guides')]);
      await ready(page, 'explore'); assertion = 'Search reached the published catalog';
    } else if (kind === 'explore') {
      await input(page, 'City (exact name)', 'Kyoto'); await button(page, 'Find guides');
      await page.waitForFunction(() => new URL(location.href).searchParams.get('city') === 'Kyoto');
      await ready(page, 'explore'); assertion = 'City filter retained the real published guide';
    } else if (kind === 'guide') {
      await button(page, 'Plan as a device-only draft');
      await page.waitForFunction(() => document.body.textContent.includes('Draft stop title'));
      assertion = 'Authored guide produced an explicitly device-only draft';
    } else {
      const note = 'Synthetic lab persisted note'; await input(page, 'Private note', note); await button(page, 'Save stop');
      await page.waitForFunction(() => document.querySelector('[data-testid="trip-save-state"]')?.textContent.includes('Saved to your account'));
      const snapshot = checked(await actor.rpc('get_trip_snapshot', {p_trip_id: fixture.tripId}));
      if (snapshot.days[0].stops[0].travellerNote !== note) throw Error('Trip interaction did not persist');
      assertion = 'Private note verified from a fresh server snapshot';
    }
    const durationMs = performance.now()-started;
    const api = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => new URL(e.name).pathname.startsWith('/api/'))
      .map(e => ({path: new URL(e.name).pathname, durationMs: e.duration})));
    interactions.push({page: kind, status: 'PASS', assertion, durationMs, api, traceFile: `${kind}-interaction.trace.json`,
      metric: 'Elapsed lab interaction; not field INP'});
  } catch (error) {
    report.interactionFailure = {page:kind,error:error.message,
      state:await page.evaluate(() => ({path:location.pathname,heading:document.querySelector('h1')?.textContent,message:document.querySelector('[data-testid="trip-save-state"]')?.textContent,
        note:document.querySelector('textarea[id^="note-"]')?.value,
        saveDisabled:[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save stop')?.disabled}))};
    throw error;
  } finally {
    const completed = new Promise(resolve => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.end'); const {stream} = await completed;
    let raw = ''; for (;;) {const chunk = await session.send('IO.read',{handle: stream}); raw += chunk.data; if (chunk.eof) break;}
    await session.send('IO.close',{handle: stream}); await session.detach();
    await writeFile(path.join(out, `${kind}-interaction.trace.json`), JSON.stringify(traceWithoutArguments(JSON.parse(raw))));
  }
}
try {
  for (let i=0; i<60; i++) {if (server.exitCode !== null) throw Error('Owned app server exited');
    try {if ((await fetch(origin+'/en')).status === 200) break;} catch {}
    if (i===59) throw Error('Owned app server did not become ready'); await new Promise(r=>setTimeout(r,500));}
  if (!foundation) fixture = await setup();
  browser = await puppeteer.launch({executablePath: chromium.executablePath(), headless: true,
    args: ['--no-first-run', '--disable-background-networking', '--disable-component-update']});
  report.conditions = {browser: await browser.version(), lighthouse: '13.5.0',
    region: 'same local Windows host; loopback app and isolated database', ...flags,
    cacheDefinition: 'HTTP cache cleared before cold; retained before warm; fresh context for each pair'};
  const routes = {home: '/en', explore: '/en/explore',
    guide: foundation ? '/en/g/kyoto-slow-days' : '/en/g/'+fixture.guideId,
    trip: foundation ? '/en/trips/demo-lab-trip' : '/en/trips/'+fixture.tripId};
  const foundationModel = foundation ? (await transform(execFileSync('git',['show',foundationSha+':app/travel/model.ts'],{cwd:app,encoding:'utf8'}),
    {loader:'ts',format:'iife',globalName:'KinnsoFoundationModel'})).code : null;
  for (const [kind, initialRoute] of Object.entries(routes).filter(([kind])=>!probeTrip||kind==='trip')) for (const run of (probeTrip?[1]:[1,2,3])) {
    const context = await browser.createBrowserContext(), page = await context.newPage();
    await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    page.setDefaultTimeout(45000); await guardPage(page);
    try {
      let route=initialRoute;
      if (foundation && kind==='trip') {
        await page.goto(origin+'/en');await page.addScriptTag({content:foundationModel});
        const id=await page.evaluate(()=>{KinnsoFoundationModel.session('owner');return KinnsoFoundationModel.clone('kyoto-slow-days','Synthetic foundation demo trip','',crypto.randomUUID()).id;});
        route='/en/trips/'+id;
      }
      if (!foundation && kind === 'trip') {
        await page.goto(origin+'/en/sign-in?next='+encodeURIComponent(route));
        await input(page,'Email',fixture.email); await input(page,'Password',fixture.password);
        await Promise.all([page.waitForNavigation(),button(page,'Sign in')]); await ready(page,kind);
      }
      const session = await page.createCDPSession(); await session.send('Network.clearBrowserCache'); await session.detach();
      await navigation(page,kind,route,'cold',run); await navigation(page,kind,route,'warm',run);
      if (!foundation && run === (probeTrip?1:3)) await interaction(page,kind);
    } finally {await context.close();}
  }
  if (!foundation) {
    const querySamples = [];
    const client = createClient(target.apiOrigin, process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
    for (const kind of ['home','explore','guide','trip']) for (const run of [1,2,3]) {
      const start = performance.now();
      if (kind === 'home' || kind === 'explore') checked(await client.from('guides')
        .select('id,slug,title,city,summary,cover_url,creator_handle,creator_name,published_at')
        .eq('status','published').order('published_at',{ascending:false,nullsFirst:false}).order('id').limit(13));
      else if (kind === 'guide') checked(await client.rpc('kinnso_guide',{p_guide_id:fixture.guideId}));
      else checked(await actor.rpc('get_trip_snapshot',{p_trip_id:fixture.tripId}));
      querySamples.push({page:kind,run,durationMs:performance.now()-start,
        operation:kind==='trip'?'get_trip_snapshot':kind==='guide'?'kinnso_guide':'published catalog projection',status:'PASS'});
    }
    report.queryLatency = {status:'MEASURED_LOCAL_BACKEND_ROUNDTRIPS',samples:querySamples,
      scope:'Separate equivalent backend reads, three per core page; includes local HTTP/PostgREST overhead, not isolated PostgreSQL execution time or cloud p95'};
  }
  if (!foundation) {
    const baselinePath = process.env.KINNSO_LAB_BASELINE;
    if (baselinePath) {
      const resolved = path.resolve(baselinePath), allowed = path.join(app,'evidence/performance')+path.sep;
      if (!resolved.startsWith(allowed)) throw Error('Baseline report must belong to the local ignored performance directory');
      report.comparison = compareLab(report, JSON.parse(await readFile(resolved,'utf8')));
    } else report.comparison = {status:'NOT_RUN',reason:'Run the frozen foundation and supply its report path'};
  }
  report.blockedOrigins = [...blockedOrigins];
} catch (error) {report.error = error.message; process.exitCode = 1;}
finally {
  const cleanupErrors = [];
  try {await browser?.close();} catch (error) {cleanupErrors.push('Browser: '+error.message);}
  for (const id of ownedActors) try {const result = await admin.auth.admin.deleteUser(id); if (result.error) cleanupErrors.push(result.error.message);}
    catch (error) {cleanupErrors.push('Owned fixture: '+error.message);}
  report.cleanup = cleanupErrors.length ? {status:'FAIL',errors:cleanupErrors} : 'PASS_OWNED_SYNTHETIC_ACTORS_REMOVED';
  if (cleanupErrors.length) process.exitCode = 1;
  if (server.exitCode === null) {const stopped = new Promise(resolve => server.once('exit',resolve)); server.kill(); await stopped;}
  serverLog.end();
  report.assessment=assessRun(report);
  if(report.assessment.status==='INCOMPLETE')process.exitCode=1;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify({report:path.join(out,'report.json'), assessment:report.assessment?.status, error:report.error, cleanup:report.cleanup}));
}
