import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import type { CreatorSummary } from '@/lib/creators/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function CreatorsLandingView({
  locale,
  t,
  creators,
}: {
  locale: Locale
  t: Messages['creatorsLanding']
  creators: CreatorSummary[]
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <div className="bg-kinnso-cream font-sans">
      {/* Compact hero + apply CTA */}
      <SectionShell as="header" className="py-12 md:py-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Eyebrow>{t.heroPill}</Eyebrow>
            <h1 className="k2-display mt-3 max-w-2xl text-4xl font-semibold leading-[1.08] md:text-5xl text-kinnso-ink">{t.directoryHeading}</h1>
            <p className="mt-3 max-w-xl text-kinnso-muted">{t.directorySub}</p>
          </div>
          <Link href={p('/sign-up')} className="k2-btn-primary inline-flex shrink-0">
            {t.applyCta} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </SectionShell>

      {/* Directory grid */}
      <section className="k2-creator-directory k2-container py-12">
        {creators.length > 0 ? (
          <ul className="k2-creator-grid grid gap-5">
            {creators.map((c) => (
              <li key={c.handle}>
                <div className="k2-card flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <EntityMedia src={null} title={c.name} sizes="48px" className="h-12 w-12 shrink-0 rounded-full [&_[data-media-placeholder=true]>span]:hidden [&_[data-media-placeholder=true]]:p-0" />
                    <div>
                      <div className="font-bold text-kinnso-ink">{c.name}</div>
                      <div className="text-xs text-kinnso-muted">@{c.handle}</div>
                    </div>
                  </div>
                  {c.bio && <p className="mt-3 line-clamp-2 text-sm text-kinnso-muted">{c.bio}</p>}
                  {c.niches.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.niches.slice(0, 3).map((n) => (
                        <span key={n} className="rounded-md bg-kinnso-cream2 px-2 py-0.5 text-[11px] text-kinnso-ink">{n}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between border-t border-kinnso-edge pt-3">
                    <span className="text-xs text-kinnso-muted">{t.guideCount.replace('{count}', String(c.guideCount))}</span>
                    <Link href={p(`/c/${c.handle}`)} className="k2-btn-ghost inline-flex text-sm">
                      {t.viewProfile} <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[4px] border border-kinnso-edge bg-kinnso-cream2 px-5 py-8 text-center text-kinnso-muted">{t.directoryEmpty}</p>
        )}
      </section>

      {/* Bottom apply CTA */}
      <section className="k2-container pb-20">
        <div className="k2-card p-8 text-center">
          <h2 className="text-2xl font-semibold text-kinnso-ink">{t.ctaTitle}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaDesc}</p>
          <Link href={p('/sign-up')} className="k2-btn-primary mt-5 inline-flex">
            {t.ctaButton} <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}

export default CreatorsLandingView
