/** Author-facing content-honesty helpers. Pure module: no database, no network,
 * safe to import from client components, the Workbench wiring and the
 * node:test suite. The RPCs remain the source of truth; these helpers only
 * describe the same ladder for the creator editor so a preview cannot invent a
 * status the server would reject. The precedence itself is imported from
 * contracts.ts (which mirrors kinnso_internal.guide_honesty_payload) rather
 * than re-implemented here. */

import { guideHonestyStatus } from './contracts.ts';
import type { AuthorHonesty, GuideHonestyFacts, GuideHonestyStatus } from './contracts.ts';

/** The steps a guide still owes before it can reach 'verified', in ladder
 * order. Ops verifies the place details; the creator owns attestation/sources. */
export type VerificationRequirement = 'attestation' | 'sources' | 'placeVerification';

export const VERIFICATION_REQUIREMENTS: readonly VerificationRequirement[] = [
  'attestation',
  'sources',
  'placeVerification',
];

/** The four facts the status derivation reads. Any AuthorHonesty payload is
 * assignable to this, so callers can pass the server projection directly. */
export type AuthorHonestyFacts = GuideHonestyFacts;

/** Re-derives the status from payload facts. This is the same precedence the
 * SQL uses (synthetic wins, then verified needs all three facts, then attested,
 * else unverified); publishing is deliberately not an input. */
export function authorHonestyStatus(facts: GuideHonestyFacts): GuideHonestyStatus {
  return guideHonestyStatus(facts);
}

/** Draft/published parity: true when two projections with the same facts agree
 * on the ladder. Publishing is not a status input, so a draft and the published
 * copy of the same guide must report the same status. */
export function statusParity(draft: AuthorHonesty, published: AuthorHonesty): boolean {
  return draft.status === published.status
    && authorHonestyStatus(draft) === authorHonestyStatus(published);
}

/** Which verification steps are still missing. Synthetic guides never reach
 * 'verified' and report nothing; a verified guide reports an empty list. */
export function missingVerifiedSteps(
  honesty: Pick<AuthorHonesty, 'synthetic' | 'sourceCount' | 'attestedAt' | 'placeVerifiedAt'>,
): VerificationRequirement[] {
  if (honesty.synthetic) return [];
  const missing: VerificationRequirement[] = [];
  if (honesty.attestedAt === null) missing.push('attestation');
  if (honesty.sourceCount < 1) missing.push('sources');
  if (honesty.placeVerifiedAt === null) missing.push('placeVerification');
  return missing;
}
