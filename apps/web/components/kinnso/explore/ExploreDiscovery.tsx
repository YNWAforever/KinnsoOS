"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GuideCard from '@/components/kinnso/GuideCard'
import { ExploreControls } from '@/components/kinnso/explore/ExploreControls'
import {
  EXPLORE_SEARCH_DEBOUNCE_MS,
  canSortByMostSaved,
  eligibleExploreDestinations,
  indexExploreGuides,
  parseExploreState,
  selectExploreResults,
  serializeExploreState,
  type ExploreSort,
  type ExploreState,
} from '@/lib/explore/discovery'
import type { Destination } from '@/lib/destinations/queries'
import type { Guide } from '@/lib/guides/types'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

const DEFAULT_STATE: ExploreState = { destination: null, q: '', sort: 'newest', page: 1 }
const withCount = (template: string, count: number) => template.replace('{count}', String(count))
const normalizeSearch = (value: string) => value.trim().replace(/\s+/g, ' ')

export interface ExploreDiscoveryProps {
  locale: Locale
  t: Messages['explore']
  guides: Guide[]
  destinations: Destination[]
}

export function ExploreDiscovery({ locale, t, guides, destinations }: ExploreDiscoveryProps) {
  const eligible = useMemo(() => eligibleExploreDestinations(destinations), [destinations])
  const indexed = useMemo(() => indexExploreGuides(guides, eligible), [guides, eligible])
  const allowMostSaved = useMemo(() => canSortByMostSaved(guides), [guides])
  const destinationSlugs = useMemo(() => new Set(eligible.map(({ slug }) => slug)), [eligible])
  const [state, setState] = useState<ExploreState>(DEFAULT_STATE)
  const [searchValue, setSearchValue] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const stateRef = useRef<ExploreState>(DEFAULT_STATE)
  const didHydrate = useRef(false)

  /**
   * Next.js 16 integrates the native History API with its router, so pushState
   * here participates in normal back/forward navigation (see the "Shallow
   * routing on the client" guide).
   *
   * Discrete choices push, so Back undoes them one at a time. Typing replaces,
   * because a history entry per keystroke would make Back feel broken in the
   * other direction -- a viewer would have to press it a dozen times to leave
   * a search they typed once.
   */
  const writeUrl = useCallback((next: ExploreState, mode: 'push' | 'replace') => {
    const query = serializeExploreState(next).toString()
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    if (mode === 'push') window.history.pushState(window.history.state, '', url)
    else window.history.replaceState(window.history.state, '', url)
  }, [])

  const commit = useCallback((next: ExploreState, mode: 'push' | 'replace' = 'push') => {
    stateRef.current = next
    setState(next)
    writeUrl(next, mode)
  }, [writeUrl])

  useEffect(() => {
    if (didHydrate.current) return
    didHydrate.current = true
    const restored = parseExploreState(
      new URLSearchParams(window.location.search),
      destinationSlugs,
      allowMostSaved,
    )
    stateRef.current = restored
    setState(restored)
    setSearchValue(restored.q)
    setHydrated(true)
  }, [allowMostSaved, destinationSlugs])

  // Back/forward rewrites the URL without remounting this component, so the
  // grid has to be re-derived from the restored query or the two silently
  // disagree -- the visible filters would describe a result set that is no
  // longer on screen.
  useEffect(() => {
    const onPopState = () => {
      const restored = parseExploreState(
        new URLSearchParams(window.location.search),
        destinationSlugs,
        allowMostSaved,
      )
      stateRef.current = restored
      setState(restored)
      // Also resets the input, otherwise the debounce below sees a stale value
      // and immediately re-commits the search the viewer just navigated away from.
      setSearchValue(restored.q)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [allowMostSaved, destinationSlugs])

  useEffect(() => {
    if (!hydrated || searchValue === stateRef.current.q) return
    const timeout = window.setTimeout(() => {
      const q = normalizeSearch(searchValue)
      if (q === stateRef.current.q) return
      commit({ ...stateRef.current, q, page: 1 }, 'replace')
    }, EXPLORE_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [commit, hydrated, searchValue])

  const results = useMemo(() => selectExploreResults(indexed, state), [indexed, state])
  const reset = () => {
    setSearchValue('')
    commit(DEFAULT_STATE)
  }

  return (
    <section aria-labelledby="explore-grid-heading" className="mt-10">
      <ExploreControls
        t={t}
        destinations={eligible}
        destination={state.destination}
        searchValue={searchValue}
        sort={state.sort}
        total={results.total}
        allowMostSaved={allowMostSaved}
        onDestinationChange={(destination) => {
          commit({ ...stateRef.current, destination, page: 1 })
        }}
        onSearchChange={setSearchValue}
        onSortChange={(sort: ExploreSort) => {
          commit({ ...stateRef.current, sort, page: 1 })
        }}
      >
        <p role="status" aria-live="polite" className="mt-5 text-sm text-kinnso-muted">
          {withCount(t.resultsLabel, results.total)}
        </p>
        <h2 id="explore-grid-heading" className="sr-only">{t.gridHeading}</h2>
        {results.total ? (
          <>
            <div className="k2-explore-guide-grid mt-5 grid gap-5">
              {results.visible.map((guide) => (
                <GuideCard
                  key={guide.slug}
                  g={guide}
                  locale={locale}
                  savesLabel={t.savesLabel}
                />
              ))}
            </div>
            {results.hasMore ? (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  className="k-btn-secondary"
                  onClick={() => {
                    commit({ ...stateRef.current, page: stateRef.current.page + 1 })
                  }}
                >
                  {t.loadMore}
                </button>
              </div>
            ) : (
              <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>
            )}
          </>
        ) : guides.length && (state.destination || state.q || state.sort !== 'newest') ? (
          <div className="mt-8 rounded-3xl border border-kinnso-edge bg-white p-8 text-center">
            <h3 className="text-xl font-semibold text-kinnso-ink">{t.emptyFilteredTitle}</h3>
            <p className="mt-2 text-kinnso-muted">{t.emptyFilteredBody}</p>
            <button type="button" className="k-btn-secondary mt-5" onClick={reset}>
              {t.resetFilters}
            </button>
          </div>
        ) : (
          <p className="mt-8 text-sm text-kinnso-muted">{t.emptyNote}</p>
        )}
      </ExploreControls>
    </section>
  )
}
