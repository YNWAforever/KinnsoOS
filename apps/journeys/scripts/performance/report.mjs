export const pages = ['home', 'explore', 'guide', 'trip'];
const metrics = ['lcpMs', 'cls', 'tbtMs', 'jsTransferBytes', 'imageTransferBytes'];
const median = values => { const sorted = [...values].sort((a,b) => a-b); const m = sorted.length >> 1; return sorted.length % 2 ? sorted[m] : (sorted[m-1]+sorted[m])/2; };
export function localOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw Error('Only a loopback HTTP origin without credentials or a path is allowed');
  return url.origin;
}
export function assessLab(samples) {
  const groups = pages.flatMap(page => ['cold', 'warm'].map(cache => {
    const selected = samples.filter(s => s.page === page && s.cache === cache);
    const valid = selected.length >= 3 && new Set(selected.map(s => s.run)).size === selected.length &&
      selected.every(s => Number.isInteger(s.run) && s.run > 0 && s.status === 200 && s.verified === true &&
        metrics.every(key => typeof s[key] === 'number' && Number.isFinite(s[key]) && s[key] >= 0));
    if (!valid) return {page, cache, samples: selected.length, status: 'INCOMPLETE'};
    const values = Object.fromEntries(metrics.map(key => [key, median(selected.map(s => s[key]))]));
    return {page, cache, samples: selected.length, ...values, status: values.lcpMs <= 2500 && values.cls <= 0.1 ? 'PASS' : 'FAIL'};
  }));
  return {status: groups.some(g => g.status === 'INCOMPLETE') ? 'INCOMPLETE' : groups.some(g => g.status === 'FAIL') ? 'FAIL' : 'PASS',
    targets: {medianLcpMs: 2500, medianCls: 0.1}, groups};
}
export function compareLab(current, baseline) {
  if (JSON.stringify(current.conditions) !== JSON.stringify(baseline.conditions))
    return {status: 'NOT_COMPARABLE', reason: 'Measured browser, device and network conditions differ'};
  const a = assessLab(current.samples), b = assessLab(baseline.samples);
  const groups = a.groups.map((group, i) => {
    const before = b.groups[i];
    if (baseline.notComparable?.includes(group.page) || group.status === 'INCOMPLETE' || before.status === 'INCOMPLETE')
      return {page: group.page, cache: group.cache, status: 'NOT_COMPARABLE', reason: 'Different functionality/data or incomplete measurement'};
    return {page: group.page, cache: group.cache, status: 'COMPARABLE',
      delta: Object.fromEntries(metrics.map(key => [key, group[key]-before[key]]))};
  });
  return {status: groups.some(g => g.status === 'NOT_COMPARABLE') ? 'PARTIAL' : 'COMPARED', groups};
}
