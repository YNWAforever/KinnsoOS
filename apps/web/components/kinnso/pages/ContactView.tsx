import type { Messages } from '@/lib/i18n/messages/en'

const SUPPORT_EMAIL = 'business@kinnso.ai'

export function ContactView({ t }: { t: Messages['contact'] }) {
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
        <div className="rounded-2xl border border-kinnso-cream2 bg-white p-8 shadow-kinnso">
          <p className="text-xs font-bold uppercase tracking-wider text-kinnso-muted">{t.emailLabel}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block text-xl font-black text-kinnso-ink hover:text-kinnso-orange">
            {SUPPORT_EMAIL}
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="k-btn-primary mt-6 inline-flex">{t.emailCta}</a>
          <p className="mt-4 text-sm text-kinnso-muted">{t.responseNote}</p>
        </div>
      </section>
    </main>
  )
}

export default ContactView
