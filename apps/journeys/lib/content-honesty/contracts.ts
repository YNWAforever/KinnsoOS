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

// ---------------------------------------------------------------------------
// S3 author verification. The shapes below mirror
// supabase/migrations/20261109130000_author_verification.sql: the creator
// payload is the public GuideHonesty projection plus draft visibility and the
// source list, and the parsers apply the same bounds the RPC re-checks.
// ---------------------------------------------------------------------------

/** One creator-managed source reference. guides.source_refs stores exactly this
 * shape: a trimmed title and, when present, an https URL. */
export type GuideSource = {
  title: string;
  url?: string;
};

/** Creator-facing honesty payload returned by kinnso_creator_guide_honesty(),
 * kinnso_guide_set_sources() and kinnso_ops_set_evidence(): the public
 * projection you can show anonymously, plus whether the guide is published and
 * the source list the creator edits. */
export type AuthorHonesty = GuideHonesty & {
  published: boolean;
  sources: GuideSource[];
};

/** One row of public.kinnso_ops_published_guides(). */
export type OpsGuideRow = {
  id: string;
  title: string;
  status: GuideHonestyStatus;
  synthetic: boolean;
  rightsBasis: GuideRightsBasis;
  sourceCount: number;
  placeVerifiedAt: string | null;
  attestedAt: string | null;
};

/** {items:[...]} envelope returned by public.kinnso_ops_published_guides(). */
export type OpsGuideList = {
  items: OpsGuideRow[];
};

/** PUT /api/creator/guides/{id}/sources body. */
export type SourcesInput = {
  sources: GuideSource[];
};

/** PATCH /api/ops/guides/{id}/evidence body. `placeVerifiedAt: null` clears the
 * date (the same effect as `clearPlace: true`); an absent key leaves it alone. */
export type EvidenceInput = {
  synthetic?: boolean;
  placeVerifiedAt?: string | null;
  clearPlace?: boolean;
};

export const MAX_GUIDE_SOURCES = 20;
export const SOURCE_TITLE_MAX = 200;
export const SOURCE_URL_MAX = 500;

/** Same url rule the RPC enforces: https:// plus 1..500 non-whitespace
 * characters, no surrounding whitespace and no other scheme. */
const SOURCE_URL_PATTERN = /^https:\/\/[^\s]{1,500}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidSourceUrl(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_URL_PATTERN.test(value);
}

/** A source title is valid when its ASCII-space-trimmed value is 1..200 code
 * points, exactly what btrim() plus char_length() accept in SQL. */
export function isValidSourceTitle(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const length = characterLength(btrimSpaces(value));
  return length >= 1 && length <= SOURCE_TITLE_MAX;
}

function parseSource(value: unknown): GuideSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => key !== 'title' && key !== 'url')) return null;
  if (!('title' in item) || !isValidSourceTitle(item.title)) return null;
  const title = btrimSpaces(item.title);
  if (!('url' in item)) return { title };
  if (!isValidSourceUrl(item.url)) return null;
  return { title, url: item.url };
}

/** Validates a PUT /api/creator/guides/{id}/sources body. Only the documented
 * `sources` key is accepted: an array of 0..20 items, each exactly {title} or
 * {title, url} with the RPC's title/url rules. Returns the normalized body
 * (titles trimmed, key order fixed) or null for anything malformed. The RPC
 * additionally verifies the active-creator ownership; the parser cannot. */
export function parseSourcesInput(value: unknown): SourcesInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'sources')) return null;
  const raw = input.sources;
  if (!Array.isArray(raw) || raw.length > MAX_GUIDE_SOURCES) return null;
  const sources: GuideSource[] = [];
  for (const entry of raw) {
    const source = parseSource(entry);
    if (!source) return null;
    sources.push(source);
  }
  return { sources };
}

/** True only for a real Gregorian calendar date written YYYY-MM-DD (so
 * 2026-02-30 and 0000-01-01 are rejected before they reach the date cast). */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

/** Validates a PATCH /api/ops/guides/{id}/evidence body. Only 'synthetic',
 * 'placeVerifiedAt' and 'clearPlace' are accepted. `synthetic` must be boolean,
 * `placeVerifiedAt` must be a real YYYY-MM-DD date or null, `clearPlace` must be
 * boolean, and clearing conflicts with setting a date. At least one effective
 * field is required: {} and {clearPlace:false} would be a no-op and are
 * rejected, mirroring the RPC's 'invalid_evidence'. */
export function parseEvidenceInput(value: unknown): EvidenceInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['synthetic', 'placeVerifiedAt', 'clearPlace'].includes(key))) return null;
  const { synthetic, placeVerifiedAt, clearPlace } = input;
  if ('synthetic' in input && typeof synthetic !== 'boolean') return null;
  if ('placeVerifiedAt' in input && placeVerifiedAt !== null
    && (typeof placeVerifiedAt !== 'string' || !isCalendarDate(placeVerifiedAt))) return null;
  if ('clearPlace' in input && typeof clearPlace !== 'boolean') return null;
  if (clearPlace === true && typeof placeVerifiedAt === 'string') return null;
  if (!('synthetic' in input) && !('placeVerifiedAt' in input) && clearPlace !== true) return null;
  const parsed: EvidenceInput = {};
  if ('synthetic' in input) parsed.synthetic = synthetic as boolean;
  if ('placeVerifiedAt' in input) parsed.placeVerifiedAt = placeVerifiedAt as string | null;
  if ('clearPlace' in input) parsed.clearPlace = clearPlace as boolean;
  return parsed;
}
