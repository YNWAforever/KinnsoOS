/**
 * The single definition of "this creator appears in the public directory".
 *
 * `fetchEligibleCreators` enforces it for the directory and sitemap; the studio
 * readiness checklist uses it to tell a creator whether they meet it and what is
 * missing. Both must call this — a checklist that paraphrases the rule becomes
 * wrong the day the rule changes, and it is a rule creators act on.
 *
 * Note it requires a PUBLISHED guide. The checklist's existing "write a guide"
 * item counts drafts too, so a creator can satisfy that item and still not be
 * listed; that gap is precisely why this is stated separately.
 */
export interface DirectoryEligibility {
  /** creators.status */
  status: string | null
  /** creators.handle */
  handle: string | null
  /** creators.public_profile */
  publicProfile: unknown
  /** Guides belonging to this creator with status = 'published'. */
  publishedGuideCount: number
  /** creators.is_listed — the ops override, which bypasses the guide requirement. */
  isListed: boolean
}

export function isDirectoryListed(input: DirectoryEligibility): boolean {
  return (
    input.status === 'active' &&
    Boolean(input.handle) &&
    input.publicProfile !== null &&
    input.publicProfile !== undefined &&
    (input.isListed || input.publishedGuideCount > 0)
  )
}

/**
 * What is still missing, in the order the creator can act on it. Empty when
 * listed. `ops_override_only` is never returned as a gap — a creator cannot set
 * it themselves, so naming it would be telling them to do the impossible.
 */
export type DirectoryGap = 'not_active' | 'no_handle' | 'no_public_profile' | 'no_published_guide'

export function directoryGaps(input: DirectoryEligibility): DirectoryGap[] {
  if (isDirectoryListed(input)) return []
  const gaps: DirectoryGap[] = []
  if (input.status !== 'active') gaps.push('not_active')
  if (!input.handle) gaps.push('no_handle')
  if (input.publicProfile === null || input.publicProfile === undefined) {
    gaps.push('no_public_profile')
  }
  if (!input.isListed && input.publishedGuideCount === 0) gaps.push('no_published_guide')
  return gaps
}
