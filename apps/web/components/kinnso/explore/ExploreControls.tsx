"use client"

import { useRef, useState, type ReactNode } from 'react'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ExploreDestination, ExploreSort } from '@/lib/explore/discovery'
import type { Messages } from '@/lib/i18n/messages/en'

export interface ExploreControlsProps {
  t: Messages['explore']
  destinations: ExploreDestination[]
  destination: string | null
  searchValue: string
  sort: ExploreSort
  total: number
  allowMostSaved: boolean
  onDestinationChange: (destination: string | null) => void
  onSearchChange: (value: string) => void
  onSortChange: (sort: ExploreSort) => void
  children: ReactNode
}

const withCount = (template: string, count: number) => template.replace('{count}', String(count))

export function ExploreControls(props: ExploreControlsProps) {
  const {
    t,
    destinations,
    destination,
    searchValue,
    sort,
    total,
    allowMostSaved,
    onDestinationChange,
    onSearchChange,
    onSortChange,
    children,
  } = props
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) setTimeout(() => triggerRef.current?.focus())
  }
  const activeCount = Number(destination !== null) + Number(sort !== 'newest')
  const hasDestinations = destinations.length > 0
  const options = [
    { slug: null, name: t.allDestinations },
    ...destinations.map(({ slug, name }) => ({ slug, name })),
  ]

  const destinationOptions = (groupName: string) => hasDestinations ? (
    <fieldset aria-label={t.destinationFilterLabel} className="space-y-2">
      <legend className="mb-3 text-sm font-semibold text-kinnso-ink">{t.destinationFilterLabel}</legend>
      {options.map((option) => (
        <label
          key={option.slug ?? 'all'}
          className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-full px-3 text-sm text-kinnso-ink focus-within:ring-2 focus-within:ring-kinnso-ink"
        >
          <input
            type="radio"
            name={groupName}
            value={option.slug ?? ''}
            checked={destination === option.slug}
            onChange={() => onDestinationChange(option.slug)}
          />
          <span>{option.name}</span>
        </label>
      ))}
    </fieldset>
  ) : null

  const sortSelect = (
    <label className="grid gap-2 text-sm font-semibold text-kinnso-ink">
      {t.sortLabel}
      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as ExploreSort)}
        className="min-h-[44px] rounded-full border border-kinnso-edge bg-white px-4 font-normal"
      >
        <option value="newest">{t.newest}</option>
        {allowMostSaved ? <option value="most-saved">{t.mostSaved}</option> : null}
      </select>
    </label>
  )

  return (
    <div className="k2-explore-controls">
      <div className="k2-explore-search grid gap-3">
        <label className="grid gap-2 text-sm font-semibold text-kinnso-ink">
          {t.searchLabel}
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="min-h-[44px] rounded-full border border-kinnso-edge bg-white px-4 font-normal"
          />
        </label>
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setOpen(true)}
          className="k2-explore-filter-trigger k-btn-ghost self-end border border-kinnso-edge bg-white"
          aria-label={activeCount ? `${t.filters}, ${activeCount} ${t.activeFilters}` : t.filters}
        >
          {t.filters}{activeCount ? ` (${activeCount})` : ''}
        </button>
        <div className="k2-explore-sort self-end">{sortSelect}</div>
      </div>

      <div className={`mt-6 grid gap-8 ${hasDestinations ? 'k2-explore-with-sidebar' : ''}`}>
        {hasDestinations ? <aside className="k2-explore-sidebar">{destinationOptions('explore-destination-desktop')}</aside> : null}
        <div className="k2-explore-results min-w-0">{children}</div>
      </div>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-kinnso-cream"
        >
          <SheetHeader className="text-left">
            <div className="flex items-center justify-between gap-4">
              <SheetTitle>{t.filters}</SheetTitle>
              <SheetClose asChild>
                <button type="button" className="k-btn-ghost">{t.closeFilters}</button>
              </SheetClose>
            </div>
            <SheetDescription>{t.filtersDescription}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 px-4">{destinationOptions('explore-destination-mobile')}{sortSelect}</div>
          <SheetFooter>
            <button type="button" className="k-btn-primary w-full" onClick={() => handleOpenChange(false)}>
              {withCount(t.showResults, total)}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
