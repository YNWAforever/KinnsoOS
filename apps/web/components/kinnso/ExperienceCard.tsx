import Link from 'next/link'
import { Bookmark, MapPin } from 'lucide-react'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n/config'

export interface ExperienceCardData {
  slug: string
  title: string
  city: string
  priceAmount: number
  currency: string
  coverUrl: string | null
  savesCount: number
}

export function ExperienceCard({ experience, locale, savesLabel = 'Saves', isSaved, onSaveToggle }: {
  experience: ExperienceCardData
  locale: Locale
  savesLabel?: string
  isSaved?: boolean
  onSaveToggle?: () => void
}) {
  return (
    <div className="group relative rounded-lg border border-kinnso-cream2 bg-white hover:border-kinnso-orangeDark">
      <Link
        href={`/${locale}/experiences/${experience.slug}`}
        className={`flex items-center gap-3 rounded-lg p-3 ${onSaveToggle ? 'pr-20' : ''}`}
      >
        <EntityMedia
          src={experience.coverUrl}
          title={experience.title}
          location={experience.city}
          sizes="64px"
          className="h-16 w-16 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-kinnso-ink">{experience.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-kinnso-muted">
            <MapPin className="h-3 w-3" aria-hidden="true" /> {experience.city}
            <span>· {experience.currency} {experience.priceAmount.toLocaleString()}</span>
          </p>
        </div>
        {!onSaveToggle ? (
          <span className="flex shrink-0 items-center gap-1 p-2 text-xs text-kinnso-muted">
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{savesLabel} </span>
            {experience.savesCount.toLocaleString()}
          </span>
        ) : null}
      </Link>
      {onSaveToggle ? (
        <button
          type="button"
          aria-pressed={isSaved}
          onClick={onSaveToggle}
          className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-[3px] p-2 text-xs text-kinnso-muted hover:text-kinnso-orangeDark"
        >
          <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current text-kinnso-orangeDark')} aria-hidden="true" />
          <span className="sr-only">{savesLabel} </span>
          {experience.savesCount.toLocaleString()}
        </button>
      ) : null}
    </div>
  )
}

export default ExperienceCard
