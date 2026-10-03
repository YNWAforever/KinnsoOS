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

export function selectExploreResults(indexed: IndexedGuide[], state: ExploreState): ExploreResults {
  const query = normalize(state.q)
  const filtered = indexed.filter(({ destination, searchText }) =>
    (!state.destination || destination?.slug === state.destination) &&
    (!query || searchText.includes(query)),
  )
  const sorted = state.sort === 'most-saved'
    ? [...filtered].sort((a, b) => (b.guide.saves - a.guide.saves) || (a.sourceIndex - b.sourceIndex))
    : filtered
  const visible = sorted.slice(0, state.page * EXPLORE_PAGE_SIZE).map(({ guide }) => guide)
  return { visible, total: sorted.length, hasMore: visible.length < sorted.length }
}
