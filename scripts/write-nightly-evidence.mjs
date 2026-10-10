import process from 'node:process';
import console from 'node:console';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function main() {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--surface', '--report', '--output', '--outcome', '--target'].includes(args[i]) || !args[i + 1] || args[i] in values) throw Error('Invalid evidence arguments');
    values[args[i]] = args[i + 1];
  }
  const surface = values['--surface'], outcome = values['--outcome'], target = values['--target'];
  if (!['funnel', 'sitemap'].includes(surface) || !['success', 'failure', 'skipped', 'cancelled'].includes(outcome) || target !== 'https://remix-kinnso-web.vercel.app' || !values['--report'] || !values['--output']) throw Error('Invalid evidence scope');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!/^[a-f0-9]{40}$/.test(source) || process.env.GITHUB_SHA !== source) throw Error('Checkout revision mismatch');

  let counts = null, reportStatus = 'MISSING';
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  if (existsSync(values['--report']) && ['skipped', 'cancelled'].includes(outcome)) reportStatus = 'NOT_RUN';
  else if (existsSync(values['--report'])) {
    reportStatus = 'INVALID';
    try {
      const report = JSON.parse(readFileSync(values['--report'], 'utf8'));
      if (surface === 'funnel') {
        const stats = report?.stats;
        const metadata = report?.config?.metadata;
        if (metadata?.targetOrigin === target && metadata.sourceRevision === source && metadata.runId === process.env.GITHUB_RUN_ID && metadata.runAttempt === process.env.GITHUB_RUN_ATTEMPT && metadata.bookingLive === false && metadata.remoteReadOnlyOptIn === true && stats && ['expected', 'unexpected', 'flaky', 'skipped'].every(key => integer(stats[key]))) {
          const total = stats.expected + stats.unexpected + stats.flaky + stats.skipped;
          if (Number.isSafeInteger(total)) {
            counts = { total, passed: stats.expected, failed: stats.unexpected, flaky: stats.flaky, skipped: stats.skipped };
            reportStatus = total === 0 ? 'EMPTY' : 'VALID';
          }
        }
      } else if (integer(report?.checked) && integer(report?.failureCount) && report.targetOrigin === target && report.sourceRevision === source && report.runId === process.env.GITHUB_RUN_ID && report.runAttempt === process.env.GITHUB_RUN_ATTEMPT) {
        counts = { checkedUrls: report.checked, failures: report.failureCount };
        reportStatus = 'VALID';
      }
    } catch { /* Never copy parse errors or report contents into the safe receipt. */ }
  }
  const receipt = {
    schemaVersion: 1, observedAt: new Date().toISOString(), surface,
    sourceRevision: source, runtimeSourceRevision: 'NOT_CHECKED',
    runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    event: process.env.GITHUB_EVENT_NAME ?? null,
    targetOrigin: target, scope: surface === 'funnel' ? 'legacy_anonymous_readonly_plus_labelled_funnel_fixture' : 'legacy_anonymous_sitemap_gets',
    executionOutcome: outcome, reportStatus, counts,
    signedInAcceptance: 'NOT_RUN', journeysRoleAcceptance: 'NOT_RUN',
  };
  mkdirSync(path.dirname(values['--output']), { recursive: true });
  writeFileSync(values['--output'], JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt));
  if (outcome === 'success' && (reportStatus !== 'VALID' || (surface === 'funnel' ? counts.failed > 0 : counts.failures > 0))) process.exitCode = 1;
}

try { main(); } catch { console.error('Read-only evidence could not be verified; raw report and environment values suppressed.'); process.exitCode = 1; }
