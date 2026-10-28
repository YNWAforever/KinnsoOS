import type { execFileSync } from 'node:child_process';
type Target = {
  projectRef: string;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};
export function requireWorkerSupabaseTarget(env?: Record<string, string | undefined>, run?: typeof execFileSync): Target;
export function requireSyntheticMysqlTarget(env: Record<string, string | undefined>, target: Target, run?: typeof execFileSync): {
  host: string; port: number; database: string; user: string; password: string; sslMode: 'disable';
};
