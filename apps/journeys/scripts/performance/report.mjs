export const pages = ['home', 'explore', 'guide', 'trip'];
export const workspacePages=['creatorList','creatorDetail','merchantCampaigns','merchantReview'];
export const operationRole=page=>page.startsWith('merchant')?'merchant_owner':page==='trip'||page.startsWith('creator')?'creator':'anonymous';
const requiredPages=report=>['operations','operations-latency'].includes(report.kind)?[...pages,...workspacePages]:pages;
export const foundationRevision = 'f181cff22d28a480120c2abaa2dde91c573582bf';
const metrics = ['lcpMs', 'cls', 'tbtMs', 'jsTransferBytes', 'imageTransferBytes'];
const median = values => { const sorted = [...values].sort((a,b) => a-b); const m = sorted.length >> 1; return sorted.length % 2 ? sorted[m] : (sorted[m-1]+sorted[m])/2; };
export function localOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw Error('Only a loopback HTTP origin without credentials or a path is allowed');
  return url.origin;
}
export function assessLab(samples,operations=false) {
  const groups = (operations?[...pages,...workspacePages]:pages).flatMap(page => ['cold', 'warm'].map(cache => {
    const selected = samples.filter(s => s.page === page && s.cache === cache);
    const valid = selected.length >= 3 && new Set(selected.map(s => s.run)).size === selected.length &&
      selected.every(s => Number.isInteger(s.run) && s.run > 0 && s.status === 200 && s.verified === true &&
      (!operations||s.role===operationRole(page))&&
        metrics.every(key => typeof s[key] === 'number' && Number.isFinite(s[key]) && s[key] >= 0));
    if (!valid) return {page, cache, samples: selected.length, status: 'INCOMPLETE'};
    const values = Object.fromEntries(metrics.map(key => [key, median(selected.map(s => s[key]))]));
    return {page, cache, samples: selected.length, ...values, status: values.lcpMs <= 2500 && values.cls <= 0.1 ? 'PASS' : 'FAIL'};
  }));
  return {status: groups.some(g => g.status === 'INCOMPLETE') ? 'INCOMPLETE' : groups.some(g => g.status === 'FAIL') ? 'FAIL' : 'PASS',
    targets: {medianLcpMs: 2500, medianCls: 0.1}, groups};
}
export function compareLab(current, baseline) {
  if (baseline.kind !== 'foundation' || baseline.sourceSha !== foundationRevision || current === baseline)
    return {status:'NOT_COMPARABLE',reason:'Baseline is not the frozen foundation source'};
  if (JSON.stringify(current.conditions) !== JSON.stringify(baseline.conditions))
    return {status: 'NOT_COMPARABLE', reason: 'Measured browser, device and network conditions differ'};
  const a = assessLab(current.samples), b = assessLab(baseline.samples);
  const groups = a.groups.map((group, i) => {
    const before = b.groups[i];
    if (['guide','trip'].includes(group.page) || baseline.notComparable?.includes(group.page) || group.status === 'INCOMPLETE' || before.status === 'INCOMPLETE')
      return {page: group.page, cache: group.cache, status: 'NOT_COMPARABLE', reason: 'Different functionality/data or incomplete measurement'};
    return {page: group.page, cache: group.cache, status: 'COMPARABLE',
      delta: Object.fromEntries(metrics.map(key => [key, group[key]-before[key]]))};
  });
  return {status: groups.some(g => g.status === 'NOT_COMPARABLE') ? 'PARTIAL' : 'COMPARED', groups};
}
export function assessRun(report) {
  const navigation=assessLab(report.samples,report.kind==='operations'), missing=[];
  if(report.error)missing.push('Run failed: '+report.error);
  if(report.cleanup!=='PASS_OWNED_SYNTHETIC_ACTORS_REMOVED')missing.push('Owned cleanup not confirmed');
  if(report.kind!=='foundation'){
    for(const page of requiredPages(report)){
      if(!report.interactions?.some(i=>i.page===page&&i.status==='PASS'&&(report.kind!=='operations'||i.role===operationRole(page))&&typeof i.traceFile==='string'&&i.traceFile))missing.push(page+' interaction');
      const queries=report.queryLatency?.samples?.filter(q=>q.page===page)??[];
      if(report.queryLatency?.status!=='MEASURED_LOCAL_BACKEND_ROUNDTRIPS'||queries.length<3||new Set(queries.map(q=>q.run)).size!==queries.length||
        queries.some(q=>q.status!=='PASS'||(report.kind==='operations'&&q.role!==operationRole(page))||typeof q.durationMs!=='number'||!Number.isFinite(q.durationMs)||q.durationMs<0))missing.push(page+' backend read timings');
    }
  }
  return {status:missing.length||navigation.status==='INCOMPLETE'?'INCOMPLETE':navigation.status,
    scope:report.kind==='foundation'?'Foundation navigation lab only':'Local navigation, interaction and equivalent backend reads; not production acceptance',
    navigation,missing};
}
/** Persist the returned evidence before any assertion can reject this navigation. */
export async function retainNavigation(result,persist,ready){
  await persist(result);
  if(result.lhr.runtimeError)throw Error(result.lhr.runtimeError.code+': '+result.lhr.runtimeError.message);
  await ready();
}

/** A stalled collector must reject while its owned cleanup/artifact window remains open. */
export async function withCollectionDeadline(collect,milliseconds,message){
  let timer;
  try{
    return await Promise.race([Promise.resolve().then(collect),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error(message)),milliseconds);
    })]);
  }finally{clearTimeout(timer);}
}

/** Per-page evidence only: no global Lighthouse logger, URLs/headers/claims or bodies. */
export function observeNavigation(page,origin,clock=()=>performance.now()) {
 const started=clock(),pending=new Map(),active=new WeakSet();let retained;
 const counts={startedRequests:0,finishedRequests:0,failedRequests:0,domContentLoaded:0,load:0,ignoredExternalRequests:0};
 const types=new Set(['document','stylesheet','image','media','font','script','texttrack','xhr','fetch','eventsource','websocket','manifest','other']);
 const owned=request=>{try{return new URL(request.url()).origin===origin;}catch{return false;}};
 const handlers={
  request:request=>{
   if(!owned(request)){counts.ignoredExternalRequests++;return;}
   if(active.has(request))return;
   active.add(request);
   counts.startedRequests++;
   if(pending.size>=256)return;
   const candidate=new URL(request.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'OWNED_ID');
   const safe=/^\/api\/(?:catalog|guides\/OWNED_ID|trips\/OWNED_ID|creator\/missions(?:\/OWNED_ID)?|merchant\/campaigns)$/.test(candidate)||/^\/(?:en|zh-HK)(?:\/explore|\/guides\/OWNED_ID|\/trips\/OWNED_ID|\/studio\/missions(?:\/OWNED_ID)?|\/merchant\/campaigns)?$/.test(candidate);
   const path=safe?candidate:candidate.startsWith('/_next/')?'/_next/ASSET':'OTHER_OWNED_REQUEST';
   const type=request.resourceType();pending.set(request,{path,type:types.has(type)?type:'other',started:clock()});
  },
  requestfinished:request=>{if(active.delete(request)){counts.finishedRequests++;pending.delete(request);}},
  requestfailed:request=>{if(active.delete(request)){counts.failedRequests++;pending.delete(request);}},
  domcontentloaded:()=>{counts.domContentLoaded++;},load:()=>{counts.load++;},
 };
 for(const[event,handler]of Object.entries(handlers))page.on(event,handler);
 return{stop(){
  if(retained)return retained;
  for(const[event,handler]of Object.entries(handlers))page.off(event,handler);
  const ended=clock(),pendingRequestCount=Math.max(0,counts.startedRequests-counts.finishedRequests-counts.failedRequests);
  retained={elapsedMs:Math.max(0,ended-started),...counts,pendingRequestCount,
   pendingRequestsTruncated:pendingRequestCount>pending.size||pending.size>10,
   pendingRequests:[...pending.values()].slice(0,10).map(({path,type,started})=>({path,type,elapsedMs:Math.max(0,ended-started)}))};
  pending.clear();return retained;
 }};
}

/** A controlled warm-read baseline, kept separate from browser/field metrics. */
export function assessLatency(report, budgets) {
  const layers = ['api', 'postgrest', 'postgres'], missing = [];
  const dataset = report.dataset ?? {};
  if (!(Number.isInteger(dataset.observedRowCap) && dataset.observedRowCap > 0 &&
      Number.isInteger(dataset.guides) && dataset.guides > dataset.observedRowCap * 2 &&
      dataset.tripDays === 1 && dataset.tripStops === 1)) missing.push('Verified scale dataset');
  if(report.kind==='operations-latency'&&!(dataset.operations?.campaigns>=55&&dataset.operations.acceptedCreatorWork>=55&&dataset.operations.reviewSubmissions>=1&&['creator','merchant_owner'].every(role=>dataset.operations.roles?.includes(role))))missing.push('Verified owned collaboration dataset and roles');
  if (report.error) missing.push('Collection failed');
  if (report.cleanup !== 'PASS_OWNED_SYNTHETIC_ACTORS_REMOVED') missing.push('Owned cleanup');
  const validBudgets = budgets && typeof budgets === 'object' && !Array.isArray(budgets) &&
    layers.every(layer => typeof budgets[layer] === 'number' && Number.isFinite(budgets[layer]) && budgets[layer] > 0);
  if (budgets !== undefined && !validBudgets) missing.push('Finite positive budgets for all layers');
  const samples = Array.isArray(report.samples) ? report.samples.filter(s => s && typeof s === 'object') : [];
  const groups = layers.flatMap(layer => requiredPages(report).map(operation => {
    const selected = samples.filter(s => s.layer === layer && s.operation === operation);
    const valid = selected.length >= 40 && new Set(selected.map(s => s.run)).size === selected.length &&
      selected.every(s => Number.isInteger(s.run) && s.run > 0 && s.status === 'PASS' && s.verified === true &&
        (report.kind!=='operations-latency'||s.role===operationRole(operation))&&
        typeof s.durationMs === 'number' && Number.isFinite(s.durationMs) && s.durationMs >= 0);
    if (!valid) {missing.push(layer+'/'+operation+' measurements'); return {layer, operation, samples: selected.length, status: 'INCOMPLETE'};}
    const values = selected.map(s => s.durationMs).sort((a,b) => a-b);
    const p95Ms = values[Math.ceil(values.length * 0.95)-1];
    const budgetMs = validBudgets ? budgets[layer] : undefined;
    return {layer, operation, samples: selected.length, medianMs: median(values), p95Ms,
      maxMs: values.at(-1), budgetMs: budgetMs ?? null,
      status: budgetMs === undefined ? 'MEASURED_BUDGET_NOT_SET' : p95Ms <= budgetMs ? 'PASS' : 'FAIL'};
  }));
  return {status: missing.length ? 'INCOMPLETE' : budgets === undefined ? 'MEASURED_BUDGET_NOT_SET' :
    groups.some(g => g.status === 'FAIL') ? 'FAIL' : 'PASS', groups, missing,
    percentile: 'nearest-rank ceil(0.95*N), minimum 40 verified samples per operation/layer',
    scope: 'Owned local warm reads only; not production, concurrent load, cold database or field latency'};
}

export function validateLatencyBudget(budget, baseline, sourceSha, project) {
  if (!budget || typeof budget !== 'object' || budget.environment !== 'owned isolated local' ||
      budget.project !== project || budget.sourceSha !== sourceSha || !budget.limits ||
      typeof budget.limits !== 'object' || Array.isArray(budget.limits) ||
      ['api','postgrest','postgres'].some(layer => typeof budget.limits[layer] !== 'number' ||
        !Number.isFinite(budget.limits[layer]) || budget.limits[layer] <= 0))
    throw Error('Invalid source-bound local latency budget');
  if (!baseline || baseline.environment !== 'owned isolated local' || baseline.project !== project ||
      baseline.sourceSha !== sourceSha || assessLatency(baseline).status !== 'MEASURED_BUDGET_NOT_SET')
    throw Error('A complete same-source owned local baseline is required');
}
