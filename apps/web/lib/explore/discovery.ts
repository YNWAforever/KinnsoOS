import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'

export const EXPLORE_PAGE_SIZE = 12
export const EXPLORE_SEARCH_DEBOUNCE_MS = 250
export type ExploreSort = 'newest' | 'most-saved'
export interface ExploreState { destination: string | null; q: string; sort: ExploreSort; page: number }
export type ExploreDestination = Pick<Destination, 'slug' | 'name' | 'matchTerms' | 'guideCount'>
export interface IndexedGuide {
  guide: Guide
  destination: ExploreDestination | null
  sourceIndex: number
  searchText: string
}
export interface ExploreResults { visible: Guide[]; total: number; hasMore: boolean }

const cleanWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ')
const normalize = (value: string) => cleanWhitespace(value).toLocaleLowerCase()

export function eligibleExploreDestinations(destinations: Destination[]): ExploreDestination[] {
  return destinations
    .filter(({ guideCount }) => guideCount > 0)
    .map(({ slug, name, matchTerms, guideCount }) => ({ slug, name, matchTerms, guideCount }))
}

export function canSortByMostSaved(guides: Guide[]): boolean {
  return guides.some(({ saves }) => Number.isFinite(saves) && saves > 0)
}

export function indexExploreGuides(guides: Guide[], destinations: ExploreDestination[]): IndexedGuide[] {
  return guides.map((guide, sourceIndex) => {
    const city = normalize(guide.city)
    const destination = destinations.find((candidate) =>
      [candidate.name, ...candidate.matchTerms].some((term) => normalize(term) === city),
    ) ?? null
    const searchText = normalize([
      guide.title,
      guide.summary ?? '',
      guide.creatorHandle,
      guide.city,
      destination?.name ?? '',
      ...(destination?.matchTerms ?? []),
    ].join(' '))
    return { guide, destination, sourceIndex, searchText }
  })
}

export function parseExploreState(
  params: URLSearchParams,
  destinationSlugs: ReadonlySet<string>,
  allowMostSaved: boolean,
): ExploreState {
  const requestedDestination = params.get('destination')
  const requestedSort = params.get('sort')
  const requestedPage = Number(params.get('page') ?? '1')
  return {
    destination: requestedDestination && destinationSlugs.has(requestedDestination) ? requestedDestination : null,
    q: cleanWhitespace(params.get('q') ?? ''),
    sort: requestedSort === 'most-saved' && allowMostSaved ? 'most-saved' : 'newest',
    page: Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1,
  }
}

export function serializeExploreState(state: ExploreState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.destination) params.set('destination', state.destination)
  if (cleanWhitespace(state.q)) params.set('q', cleanWhitespace(state.q))
  if (state.sort !== 'newest') params.set('sort', state.sort)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

/**
 * Same rules as search_guides: a title phrase matches on its own, otherwise
 * websearch_to_tsquery('simple') applies to title, summary and city (plus the
 * card fields explore already searches). Words are AND, `or` is OR, quotes are
 * a phrase, and a leading minus excludes a word.
 */
export function matchesPublishedGuideSearch(searchText: string, title: string, rawQuery: string): boolean {
  const query = normalize(rawQuery)
  if (!query) return true
  if (normalize(title).includes(query)) return true
  return orClauses(query).some((clause) => websearchClause(searchText, clause))
}

function orClauses(query: string): string[] {
  const clauses: string[] = []
  let current = ''
  let quoted = false
  for (const token of query.split(' ')) {
    if (!token) continue
    if (token.startsWith('"')) quoted = true
    if (!quoted && token === 'or') {
      clauses.push(current.trim())
      current = ''
      continue
    }
    current += (current ? ' ' : '') + token
    if (token.endsWith('"') && token.length > 1) quoted = false
  }
  if (current.trim()) clauses.push(current.trim())
  return clauses
}

function websearchClause(haystack: string, clause: string): boolean {
  const parts = clause.match(/"[^"]+"|-\S+|\S+/g) ?? []
  return parts.length > 0 && parts.every((part) => {
    if (part.startsWith('"') && part.endsWith('"')) {
      const phrase = normalize(part.slice(1, -1))
      return phrase.length > 0 && haystack.includes(phrase)
    }
    if (part.startsWith('-') && part.length > 1) return !haystack.includes(part.slice(1))
    return haystack.includes(part)
  })
}

export function selectExploreResults(indexed: IndexedGuide[], state: ExploreState): ExploreResults {
  const filtered = indexed.filter(({ destination, guide, searchText }) =>
    (!state.destination || destination?.slug === state.destination) &&
    matchesPublishedGuideSearch(searchText, guide.title, state.q),
  )
  const sorted = state.sort === 'most-saved'
    ? [...filtered].sort((a, b) => (b.guide.saves - a.guide.saves) || (a.sourceIndex - b.sourceIndex))
    : filtered
  const visible = sorted.slice(0, state.page * EXPLORE_PAGE_SIZE).map(({ guide }) => guide)
  return { visible, total: sorted.length, hasMore: visible.length < sorted.length }
}
