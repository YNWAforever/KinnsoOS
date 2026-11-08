/** Content-honesty contracts shared by the public library, creator editor and
 * ops readiness view. The status derivation and attestation bounds mirror the
 * SQL in supabase/migrations/20261109120000_content_honesty.sql exactly; keep
 * the two in step. Pure module: safe to import from client components and from
 * the node:test suite without a database. */

export type GuideHonestyStatus = 'synthetic' | 'unverified' | 'attested' | 'verified';

/** rights_basis defaults to 'unknown' for rows that predate attestations. */
export type GuideRightsBasis = 'original' | 'licensed' | 'unknown';

/** Rights bases a creator may attest to (the RPC rejects 'unknown'). */
export type AttestationRightsBasis = 'original' | 'licensed';

export type GuideHonesty = {
  id: string;
  status: GuideHonestyStatus;
  synthetic: boolean;
  /** Basis declared by the latest attestation when one exists, otherwise the
   * guides.rights_basis projection (default 'unknown' before any attestation). */
  rightsBasis: GuideRightsBasis;
  sourceCount: number;
  placeVerifiedAt: string | null;
  attestedAt: string | null;
  latestAttestedVersion: number | null;
};

/** Published-corpus counts returned by public.kinnso_content_readiness().
 * articleRows/fixtureArticles are null when the schema cannot support an
 * honest count (public.articles has no synthetic/fixture classification). */
export type ContentReadiness = {
  published: number;
  synthetic: number;
  unverified: number;
  attested: number;
  verified: number;
  withSources: number;
  withPlaceVerification: number;
  attestedVersions: number;
  articleRows: number | null;
  fixtureArticles: number | null;
};

export type AttestInput = {
  version: number;
  rightsBasis: AttestationRightsBasis;
  statement: string;
};

/** Returned by public.kinnso_attest_guide_version() after an append or replay. */
export type GuideAttestation = {
  guideId: string;
  version: number;
  rightsBasis: AttestationRightsBasis;
  attestedAt: string;
  status: GuideHonestyStatus;
};

export const ATTESTATION_STATEMENT_MIN = 40;
export const ATTESTATION_STATEMENT_MAX = 2000;
export const ATTESTATION_RIGHTS_BASES: readonly AttestationRightsBasis[] = ['original', 'licensed'];

const MAX_ATTESTATION_VERSION = 2147483647;

export type GuideHonestyFacts = {
  synthetic: boolean;
  sourceCount: number;
  placeVerifiedAt: string | null;
  attestedAt: string | null;
};

/**
 * Mirrors the SQL precedence in kinnso_internal.guide_honesty_payload:
 * synthetic wins over everything; verified needs an attestation AND sources
 * AND a place verification; attested needs only the attestation; otherwise
 * unverified. Attestations/sources/place checks never upgrade a synthetic row.
 */
export function guideHonestyStatus(facts: GuideHonestyFacts): GuideHonestyStatus {
  if (facts.synthetic) return 'synthetic';
  if (facts.attestedAt !== null && facts.sourceCount > 0 && facts.placeVerifiedAt !== null) return 'verified';
  if (facts.attestedAt !== null) return 'attested';
  return 'unverified';
}

/** PostgreSQL btrim(value) with the default ' ' character set removes only
 * leading/trailing ASCII spaces; the RPC stores and hashes the trimmed value. */
function btrimSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 32) start += 1;
  while (end > start && value.charCodeAt(end - 1) === 32) end -= 1;
  return value.slice(start, end);
}

/** PostgreSQL char_length counts code points, not UTF-16 units. */
function characterLength(value: string): number {
  return [...value].length;
}

/**
 * Validates a POST /api/creator/guides/{id}/attest body. Only the three
 * documented keys are accepted. `version` must be a positive PostgreSQL
 * integer, `rightsBasis` must be attestable, and the trimmed statement must be
 * 40..2000 characters (the same bounds as the RPC). The RPC additionally
 * verifies the version is current and that the actor owns the guide; the
 * parser cannot know either. Returns null for anything malformed.
 */
export function parseAttestInput(value: unknown): AttestInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['version', 'rightsBasis', 'statement'].includes(key))) return null;
  const { version, rightsBasis, statement } = input;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > MAX_ATTESTATION_VERSION) return null;
  if (rightsBasis !== 'original' && rightsBasis !== 'licensed') return null;
  if (typeof statement !== 'string') return null;
  const trimmed = btrimSpaces(statement);
  const length = characterLength(trimmed);
  if (length < ATTESTATION_STATEMENT_MIN || length > ATTESTATION_STATEMENT_MAX) return null;
  return { version, rightsBasis, statement: trimmed };
}
