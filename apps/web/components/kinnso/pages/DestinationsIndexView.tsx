import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import type { Destination } from '@/lib/destinations/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function DestinationsIndexView({
  locale, t, destinations,
}: {
  locale: Locale
  t: Messages['destinations']
  destinations: Destination[]
}) {
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell className="flex min-h-[40vh] items-center">
        <div>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="sr-only">{t.eyebrow}</h2>
        {destinations.length === 0 ? (
          <p className="text-kinnso-ink/70">{t.empty}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {destinations.map((d) => (
              <Link key={d.slug} href={`/${locale}/destinations/${d.slug}`} className="group">
                <EditorialCard
                  media={
                    <EntityMedia
                      src={d.heroImageUrl}
                      title={d.name}
                      location={d.description}
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="h-full w-full"
                      imageClassName="transition duration-300 group-hover:scale-[1.02]"
                    />
                  }
                  title={d.name}
                >
                  {d.description || d.guideCount > 0 || d.experienceCount > 0 ? (
                    <>
                      {d.description ? <p>{d.description}</p> : null}
                      {d.guideCount > 0 || d.experienceCount > 0 ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-kinnso-ink/60">
                          {d.guideCount > 0 ? <span>{t.guideCount(d.guideCount)}</span> : null}
                          {d.guideCount > 0 && d.experienceCount > 0 ? <span> · </span> : null}
                          {d.experienceCount > 0 ? <span>{t.experienceCount(d.experienceCount)}</span> : null}
                        </div>
                      ) : null}
                    </>
                  ) : undefined}
                </EditorialCard>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
  )
}

export default DestinationsIndexView
