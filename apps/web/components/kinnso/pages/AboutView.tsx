import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function AboutView({ locale, t }: { locale: Locale; t: Messages['about'] }) {
  const p = (path: string) => `/${locale}${path}`
  const sections = [
    { heading: t.missionHeading, body: t.missionBody },
    { heading: t.creatorsHeading, body: t.creatorsBody },
    { heading: t.merchantsHeading, body: t.merchantsBody },
  ]
  return (
    <main>
      <section className="k-page-band py-16">
        <div className="k-container max-w-3xl">
          <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.eyebrow}</span>
          <h1 className="k-display mt-5 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.title}</h1>
          <p className="mt-4 text-lg text-kinnso-muted">{t.intro}</p>
        </div>
      </section>
      <section className="k-container max-w-3xl py-12">
        <div className="grid gap-10">
          {sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-2xl font-black text-kinnso-ink">{s.heading}</h2>
              <p className="mt-2 text-kinnso-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="k-container max-w-3xl pb-20">
        <div className="rounded-2xl border border-kinnso-cream2 bg-white p-8 text-center shadow-kinnso">
          <h2 className="text-2xl font-black text-kinnso-ink">{t.ctaHeading}</h2>
          <p className="mt-2 text-kinnso-muted">{t.ctaBody}</p>
          <Link href={p('/sign-up')} className="k-btn-primary mt-6 inline-flex">{t.ctaButton}</Link>
        </div>
      </section>
    </main>
  )
}

export default AboutView
