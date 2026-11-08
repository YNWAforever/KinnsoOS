import { serverClient } from '../supabase/server';
import type {
  AttestInput,
  AuthorHonesty,
  ContentReadiness,
  EvidenceInput,
  GuideAttestation,
  GuideHonesty,
  OpsGuideList,
  SourcesInput,
} from './contracts';

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

// ---------------------------------------------------------------------------
// S3 author verification (supabase/migrations/20261109130000). The RPCs repeat
// the creator/ops authorization at the database boundary, so these helpers only
// translate the arguments and let the SQL exception codes bubble up.
// ---------------------------------------------------------------------------

/** Creator-only honesty projection for one owned guide, drafts included. */
export function creatorGuideHonesty(guideId: string): Promise<AuthorHonesty> {
  return call<AuthorHonesty>('kinnso_creator_guide_honesty', { p_guide_id: guideId });
}

/** Creator-only atomic replacement of one owned guide's source references.
 * Never publishes: the status ladder is the same draft or published. */
export function setGuideSources(guideId: string, input: SourcesInput): Promise<AuthorHonesty> {
  return call<AuthorHonesty>('kinnso_guide_set_sources', {
    p_guide_id: guideId,
    p_sources: input.sources,
  });
}

/** Ops-only evidence update. `placeVerifiedAt: null` and `clearPlace: true`
 * both clear the date; an absent key leaves it unchanged. */
export function opsSetEvidence(guideId: string, input: EvidenceInput): Promise<AuthorHonesty> {
  return call<AuthorHonesty>('kinnso_ops_set_evidence', {
    p_guide_id: guideId,
    p_synthetic: input.synthetic ?? null,
    p_place_verified_at: typeof input.placeVerifiedAt === 'string' ? input.placeVerifiedAt : null,
    p_clear_place: input.clearPlace === true || input.placeVerifiedAt === null,
  });
}

/** Ops-only published-guide corpus, ordered by title. Omitted limit uses the RPC
 * default (50); the RPC clamps anything else to 1..200. */
export function opsPublishedGuides(limit?: number): Promise<OpsGuideList> {
  return limit === undefined
    ? call<OpsGuideList>('kinnso_ops_published_guides')
    : call<OpsGuideList>('kinnso_ops_published_guides', { p_limit: limit });
}
