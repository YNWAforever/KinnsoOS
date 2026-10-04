import Link from 'next/link'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ComingSoonPage({ locale, title, t }: { locale: Locale; title: string; t: Messages['comingSoon'] }) {
  return (
    <main className="flex min-h-[70vh] items-center bg-kinnso-cream font-sans">
      <SectionShell as="div" className="w-full">
        <div className="max-w-2xl">
          <Eyebrow>{t.heading}</Eyebrow>
          <h1 className="k2-display mt-4 text-4xl font-semibold leading-[1.08] text-kinnso-ink md:text-6xl">{title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-kinnso-ink/70">{t.body}</p>
          <Link href={`/${locale}`} className="k2-btn-primary mt-8">{t.back}</Link>
        </div>
      </SectionShell>
    </main>
  )
}
