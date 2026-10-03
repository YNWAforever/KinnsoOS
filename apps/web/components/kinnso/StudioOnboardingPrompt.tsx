import Link from 'next/link'
import BearMascot from '@/components/kinnso/BearMascot'
import type { Messages } from '@/lib/i18n/messages/en'

/** Empty state for a logged-in creator with no valid published DNA. */
export function StudioOnboardingPrompt({
  t,
  locale,
}: {
  t: Messages['studio']
  locale: string
}) {
  return (
    <div className="bg-kinnso-cream">
      <div className="k-container py-16">
        <div className="mx-auto max-w-md text-center">
          <BearMascot variant="wave" size="lg" />
          <h1 className="mt-6 text-2xl font-black text-kinnso-ink">{t.noDnaHeading}</h1>
          <p className="mt-2 text-sm text-kinnso-muted">{t.noDnaBody}</p>
          <Link href={`/${locale}/creator`} className="k-btn-primary mt-6">
            {t.noDnaCta}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default StudioOnboardingPrompt
