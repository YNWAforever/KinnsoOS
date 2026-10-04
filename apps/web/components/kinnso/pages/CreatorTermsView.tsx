import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

const TERMS_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: 'Who these terms cover',
    body: 'These terms apply to creators who join KINNSO to publish guides, take part in brand missions, and use affiliate offers. By using your creator account, you agree to them.',
  },
  {
    heading: 'Honest content & disclosure',
    body: 'You publish content you have the right to share, and you keep it honest and original. When a guide or post contains an affiliate link or paid promotion, you disclose it clearly, in line with local advertising rules and platform policies.',
  },
  {
    heading: 'Commissions & earnings',
    body: 'Affiliate and mission earnings follow the rates shown on each offer or mission. Settlement is handled manually by KINNSO based on confirmed activity from our partners. Earnings are estimates until confirmed and paid, and KINNSO does not guarantee any level of income.',
  },
  {
    heading: 'Your account & data',
    body: 'You are responsible for your account and for the accuracy of the profile information you publish. We process your data to operate KINNSO; we do not sell your personal data. Public profile fields you choose to publish are visible to others.',
  },
  {
    heading: 'Account changes & termination',
    body: 'You can stop using KINNSO at any time. We may suspend or close an account that breaks these terms, infringes others’ rights, or harms the community. Where reasonable, we will give notice.',
  },
  {
    heading: 'Questions',
    body: 'Questions about these terms? Email business@kinnso.ai.',
  },
]

export function CreatorTermsView({ locale, t }: { locale: Locale; t: Messages['creatorTerms'] }) {
  return (
    <main>
      <section className="k-page-band py-16">
        <div className="k-container max-w-3xl">
          <span className="k-pill bg-kinnso-cream2 text-kinnso-ink">{t.eyebrow}</span>
          <h1 className="k-display mt-5 text-4xl font-black tracking-tight text-kinnso-ink md:text-5xl">{t.title}</h1>
          <p className="mt-4 rounded-xl bg-kinnso-cream2 p-4 text-sm text-kinnso-ink">{t.draftNotice}</p>
          <p className="mt-2 text-sm text-kinnso-muted">{t.englishNotice}</p>
        </div>
      </section>
      <section className="k-container max-w-3xl py-12">
        <div className="grid gap-8" lang="en">
          {TERMS_SECTIONS.map((s) => (
            <div key={s.heading}>
              <h2 className="text-xl font-black text-kinnso-ink">{s.heading}</h2>
              <p className="mt-2 text-kinnso-muted">{s.body}</p>
            </div>
          ))}
        </div>
        <Link href={`/${locale}`} className="k-btn-ghost mt-10 inline-flex">{t.back}</Link>
      </section>
    </main>
  )
}

export default CreatorTermsView
