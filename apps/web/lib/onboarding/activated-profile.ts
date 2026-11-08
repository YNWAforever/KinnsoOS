import { DnaSchema, type Dna } from '@kinnso/scan'

export type ActivatedProfile =
  | { kind: 'published'; dna: Dna }
  | { kind: 'unpublished'; draft: Dna | null }

/**
 * Operator activation can set creators.status to active before any DNA is
 * published. Only a schema-valid `final` is a published profile. An AI draft,
 * a missing row, and invalid jsonb are not.
 */
export function classifyActivatedProfile(finalValue: unknown, draftValue: unknown): ActivatedProfile {
  const published = DnaSchema.safeParse(finalValue)
  if (published.success) return { kind: 'published', dna: published.data }
  const draft = DnaSchema.safeParse(draftValue)
  return { kind: 'unpublished', draft: draft.success ? draft.data : null }
}
