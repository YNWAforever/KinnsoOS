import Link from 'next/link'
import { BadgeDollarSign, Compass, PenLine } from 'lucide-react'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Testimonial } from '@/lib/home/queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/** R1C creator-acquisition landing (master spec §6 R1). Testimonials are
 *  role-filtered to creators and data-gated (spec §5 row: surfaced on homepage
 *  AND both landing pages — carry-forward #18). */
export function ForCreatorsView({ locale, t, testimonials, bookingLive }: {
  locale: Locale; t: Messages['forCreators']; testimonials: Testimonial[]; bookingLive: boolean
}) {
  const p = (path: string) => `/${locale}${path}`
  const steps = [
    { title: t.step1Title, body: t.step1Body, icon: <PenLine aria-hidden="true" className="h-5 w-5" /> },
    { title: t.step2Title, body: t.step2Body, icon: <Compass aria-hidden="true" className="h-5 w-5" /> },
    { title: t.step3Title, body: t.step3Body, icon: <BadgeDollarSign aria-hidden="true" className="h-5 w-5" /> },
  ]
  const bullets = [t.why1, t.why2, bookingLive ? t.why3Live : t.why3Waitlist]
  return (
    <div className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <Eyebrow>{t.heroEyebrow}</Eyebrow>
        <h1 className="k2-display mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{t.heroTitle}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kinnso-ink/70">{t.heroSub}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href={p('/sign-up')} className="k2-btn-primary">{t.heroCtaPrimary}</Link>
          <Link href={p('/explore')} className="k2-btn-ghost">{t.heroCtaSecondary}</Link>
        </div>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <Eyebrow>{t.howEyebrow}</Eyebrow>
        <h2 className="k2-display mt-3 text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.howHeading}</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <EditorialCard title={s.title} kicker={`0${i + 1}`}>
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-kinnso-cream2 text-kinnso-orangeDark">{s.icon}</span>
                {s.body}
              </EditorialCard>
            </li>
          ))}
        </ol>
      </SectionShell>

      <SectionShell className="k2-hairline">
        <div className="grid gap-10 lg:grid-cols-2">
          <h2 className="k2-display max-w-md text-3xl font-semibold text-kinnso-ink md:text-4xl">{t.whyHeading}</h2>
          <ul className="space-y-4">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3 leading-relaxed text-kinnso-ink/80">
                <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-kinnso-orange" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </SectionShell>

      {testimonials.length > 0 ? (
        <SectionShell className="k2-hairline" aria-labelledby="for-creators-testimonials">
          <h2 id="for-creators-testimonials" className="sr-only">{t.testimonialsHeading}</h2>
          <ul className="grid gap-10 md:grid-cols-3">
            {testimonials.map((q) => (
              <li key={q.id}>
                <figure>
                  <blockquote className="k2-display text-xl leading-snug text-kinnso-ink">&ldquo;{q.quote}&rdquo;</blockquote>
                  <figcaption className="mt-3 text-sm text-kinnso-ink/70">— {q.authorName}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </SectionShell>
      ) : null}

      <section className="bg-kinnso-orange py-16 md:py-24">
        <div className="k2-container">
          <h2 className="k2-display max-w-2xl text-3xl font-semibold text-white md:text-4xl">{t.ctaTitle}</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-white/90">{t.ctaBody}</p>
          <Link href={p('/sign-up')} className="mt-8 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[3px] bg-kinnso-ink px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{t.ctaButton}</Link>
        </div>
      </section>
    </div>
  )
}

export default ForCreatorsView
