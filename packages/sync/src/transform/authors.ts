import type { AuthorRow, LegacyPostBundle } from '../types'
import { cdnUrl, csvToArray } from './arrays'

export function transformAuthors(legacyAuthors: LegacyPostBundle['authors'], cdn: string): AuthorRow[] {
  return legacyAuthors.map((a) => ({
    slug: a.slug,
    locale: a.language,
    name: a.name,
    title: a.job_title ?? null,
    bio: a.description ?? null,
    avatar: a.image ? cdnUrl(a.image, cdn) : null,
    labels: csvToArray(a.labels),
    is_active: (a.show_in_author_page ?? 1) === 1,
  }))
}
