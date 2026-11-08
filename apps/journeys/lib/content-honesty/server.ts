import { serverClient } from '../supabase/server';
import type { AttestInput, ContentReadiness, GuideAttestation, GuideHonesty } from './contracts';

/** Thin server-side RPC boundary for content honesty. Mirrors lib/chat/server.ts:
 * the route handlers own capability/actor gating, these helpers own the call and
 * translate database failures into thrown Errors whose message is the SQL
 * exception code (e.g. 'guide_not_found', 'attestation_conflict'). */

type RpcError = { message?: string; code?: string } | null;
type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError }>;
};

function client(unknownClient: unknown): RpcClient {
  return unknownClient as RpcClient;
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await serverClient();
  if (!supabase) throw Object.assign(new Error('UNAVAILABLE'), { code: 'UNAVAILABLE' });
  const result = await client(supabase).rpc(name, args);
  if (result.error) throw Object.assign(new Error(result.error.message ?? 'RPC_FAILED'), { code: result.error.code ?? 'RPC_FAILED' });
  return result.data as T;
}

/** Published guide honesty projection. Callable anonymously (the RPC is granted
 * to anon); drafts and unknown ids raise 'guide_not_found'. */
export function getGuideHonesty(guideId: string): Promise<GuideHonesty> {
  return call<GuideHonesty>('kinnso_guide_honesty', { p_guide_id: guideId });
}

/** Ops-only published-corpus counts; the RPC raises 'forbidden' for non-ops. */
export function contentReadiness(): Promise<ContentReadiness> {
  return call<ContentReadiness>('kinnso_content_readiness');
}

/** Creator-only rights attestation for one current guide version. */
export function attestGuideVersion(guideId: string, input: AttestInput): Promise<GuideAttestation> {
  return call<GuideAttestation>('kinnso_attest_guide_version', {
    p_guide_id: guideId,
    p_version: input.version,
    p_rights_basis: input.rightsBasis,
    p_statement: input.statement,
  });
}
