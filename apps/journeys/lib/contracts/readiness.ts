import {backendTarget, capabilities} from './capabilities.ts';
import type {CapabilityMode, Environment} from './capabilities.ts';

type CheckCode = 'SUPABASE_ORIGIN' | 'APPROVED_ORIGIN_MATCH' | 'AUTH_ORIGIN_MATCH' | 'PUBLISHABLE_KEY' | 'SITE_ORIGIN';
type CheckStatus = 'pass' | 'fail' | 'unknown';
export type ReadinessReport = {
  schemaVersion: 1;
  backend: 'configured' | 'unavailable';
  checks: {code: CheckCode; status: CheckStatus}[];
  capabilities: Record<string, CapabilityMode>;
  schema: 'not_checked';
};

/** Reuse the target guard so URL/key diagnostics cannot relax its contract. */
function approvedOrigin(value: string | undefined, env: Environment): string | null {
  try {
    const origin = new URL(value ?? '').origin;
    return backendTarget({KINNSO_ENVIRONMENT:env.KINNSO_ENVIRONMENT,
      KINNSO_SUPABASE_URL:value, KINNSO_APPROVED_SUPABASE_ORIGIN:origin,
      KINNSO_LEGACY_AUTH_ORIGIN:origin, KINNSO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_readiness'})?.origin ?? null;
  } catch { return null; }
}

/** Operator-local configuration only: no I/O, schema, session or role assertion. */
export function diagnoseReadiness(env: Environment): ReadinessReport {
  const origin = approvedOrigin(env.KINNSO_SUPABASE_URL,env);
  const keyValid = backendTarget({KINNSO_SUPABASE_URL:'https://readiness.invalid',
    KINNSO_APPROVED_SUPABASE_ORIGIN:'https://readiness.invalid',
    KINNSO_LEGACY_AUTH_ORIGIN:'https://readiness.invalid',
    KINNSO_SUPABASE_PUBLISHABLE_KEY:env.KINNSO_SUPABASE_PUBLISHABLE_KEY}) !== null;
  return {
    schemaVersion:1,
    backend:backendTarget(env) ? 'configured' : 'unavailable',
    checks:[
      {code:'SUPABASE_ORIGIN',status:origin ? 'pass' : 'fail'},
      {code:'APPROVED_ORIGIN_MATCH',status:origin ? (origin===env.KINNSO_APPROVED_SUPABASE_ORIGIN ? 'pass' : 'fail') : 'unknown'},
      {code:'AUTH_ORIGIN_MATCH',status:origin ? (origin===env.KINNSO_LEGACY_AUTH_ORIGIN ? 'pass' : 'fail') : 'unknown'},
      {code:'PUBLISHABLE_KEY',status:keyValid ? 'pass' : 'fail'},
      {code:'SITE_ORIGIN',status:approvedOrigin(env.KINNSO_SITE_URL,env) ? 'pass' : 'fail'},
    ],
    capabilities:Object.fromEntries(Object.entries(capabilities(env)).map(([name,capability])=>[name,capability.mode])),
    schema:'not_checked',
  };
}
