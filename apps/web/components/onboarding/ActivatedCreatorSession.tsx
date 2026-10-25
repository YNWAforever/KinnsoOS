import Link from 'next/link'
import type { Dna } from '@kinnso/scan'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

/**
 * First session after an account is active but no creator profile has been
 * published. Studio home redirects here until `final` validates, so the only
 * forward link must not be studio home.
 */
export function ActivatedCreatorSession({
  locale,
  t,
  signOutLabel,
  draft,
  onReviewDraft,
  onContinueSetup,
}: {
  locale: Locale
  t: Messages['dna']
  signOutLabel: string
  draft: Dna | null
  onReviewDraft: () => void
  onContinueSetup: () => void
}) {
  return (
    <section className="w-full max-w-lg space-y-4" aria-labelledby="activated-creator-heading">
      <h2 id="activated-creator-heading" className="text-xl font-semibold">{t.activatedHeading}</h2>
      <p role="status" className="text-sm text-kinnso-ink/70">{t.activatedBody}</p>
      <p className="text-sm text-kinnso-ink/70">{t.activatedGuideNote}</p>
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <Link
          href={`/${locale}/studio/guides/new`}
          className="inline-flex items-center justify-center rounded-md bg-kinnso-ink px-4 py-2 text-sm font-medium text-white hover:bg-kinnso-ink/90"
        >
          {t.activatedGuideCta}
        </Link>
        {draft ? (
          <button type="button" className="text-sm underline" onClick={onReviewDraft}>
            {t.activatedReviewDraft}
          </button>
        ) : (
          <button type="button" className="text-sm underline" onClick={onContinueSetup}>
            {t.activatedContinueSetup}
          </button>
        )}
        <a href={`/${locale}/auth/sign-out`} className="text-sm underline text-kinnso-ink/70 hover:text-kinnso-ink">
          {signOutLabel}
        </a>
      </div>
    </section>
  )
}
