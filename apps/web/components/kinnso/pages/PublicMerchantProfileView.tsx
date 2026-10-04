import Link from 'next/link'
import { SectionShell } from '@/components/kinnso/editorial/SectionShell'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import type { PublicMerchant } from '@/lib/merchants/public-queries'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import GuideCard from '@/components/kinnso/GuideCard'
import { EnquiryDialog } from '@/components/kinnso/enquiries/EnquiryDialog'
import { isValidEnquiryTargetId } from '@/lib/enquiries/validation'
import type { Guide } from '@/lib/guides/types'

export function PublicMerchantProfileView({ locale, t, enquiry, booking, merchant, experiences, featuredGuides, bookingLive }: {
  locale: Locale; t: Messages['merchantProfile']; enquiry: Messages['enquiry']; booking: Messages['booking']; merchant: PublicMerchant; experiences: PublicExperience[]; featuredGuides: Guide[]; bookingLive: boolean
}) {
  const bookingLabel = bookingLive ? booking.submitCta : booking.opensSoonCta
  const p = (path: string) => `/${locale}${path}`
  return (
    <main className="bg-kinnso-cream font-sans">
      <SectionShell as="header">
        <EntityMedia src={merchant.logoUrl} title={merchant.companyName} location={merchant.city} sizes="80px" className="mb-5 h-20 w-20 rounded-full [&_[data-media-placeholder=true]>span]:hidden [&_[data-media-placeholder=true]]:p-0" />
        {merchant.city ? <Eyebrow>{merchant.city}</Eyebrow> : null}
        <h1 className="k2-display mt-4 text-3xl font-semibold text-kinnso-ink md:text-5xl">{merchant.companyName}</h1>
        {merchant.tagline ? <p className="mt-4 max-w-2xl leading-relaxed text-kinnso-ink/70">{merchant.tagline}</p> : null}
        {isValidEnquiryTargetId(merchant.id) ? (
          <div className="mt-5"><EnquiryDialog type="merchant_contact" targetId={merchant.id} targetName={merchant.companyName} triggerLabel={t.enquiryCta} t={enquiry} /></div>
        ) : null}
        {merchant.websiteUrl ? (
          <Link href={merchant.websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block font-semibold text-kinnso-orangeDark hover:underline">
            {t.websiteLabel} →
          </Link>
        ) : null}
      </SectionShell>

      <SectionShell className="k2-hairline">
        <h2 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.experiencesHeading}</h2>
        {experiences.length === 0 ? (
          <p className="mt-4 text-kinnso-muted">{t.experiencesEmpty}</p>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {experiences.map((exp) => (
              <Link key={exp.id} href={p(`/experiences/${exp.slug}`)} className="k2-card block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinnso-orange">
                <EntityMedia src={exp.coverUrl} title={exp.title} location={exp.city} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="mb-4 aspect-[4/3] w-full rounded-md" />
                <h3 className="k2-display text-lg font-semibold text-kinnso-ink">{exp.title}</h3>
                <p className="mt-2 text-sm text-kinnso-ink/70">{exp.city} · {formatExperiencePrice(locale, exp.priceAmount, exp.currency)} · {bookingLabel}</p>
              </Link>
            ))}
          </div>
        )}
      </SectionShell>

      {featuredGuides.length > 0 ? (
        <SectionShell className="k2-hairline">
          <h2 className="k2-display text-2xl font-semibold text-kinnso-ink">{t.featuredGuidesHeading}</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {featuredGuides.map((guide) => <GuideCard key={guide.slug} g={guide} locale={locale} />)}
          </div>
        </SectionShell>
      ) : null}


      <SectionShell className="k2-hairline">
        <p className="text-kinnso-ink/70">{t.workWithCreatorsNote}</p>
        <Link href={p('/for-creators')} className="mt-4 inline-block font-semibold text-kinnso-orangeDark hover:underline">{t.workWithCreatorsCta}</Link>
      </SectionShell>
    </main>
  )
}

function formatExperiencePrice(locale: Locale, amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${Number.isFinite(amount) ? amount.toLocaleString(locale) : ''}`.trim()
  }
}

export default PublicMerchantProfileView
