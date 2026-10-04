import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { TravelerTripsView } from '@/components/kinnso/pages/TravelerTripsView'
import { listMyBookings } from '@/lib/bookings/queries'
import { listSavedGuides } from '@/lib/saves/guide-queries'
import { listSavedExperiences } from '@/lib/saves/experience-queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export const metadata: Metadata = noindexMetadata()

type Params = Promise<{ locale: string }>

export default async function TripsPage({ params }: { params: Params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${loc}/sign-in`)

  // Per D-R3-5: no role check beyond "is signed in" — /trips is the default
  // landing for any authenticated user without a more specific role (traveler
  // is resolveViewerRole's fallback). A merchant/creator/ops user who also
  // personally booked something as a traveller can still see their own
  // bookings here — this is intentional, not a gap.
  const [bookings, savedGuides, savedExperiences] = await Promise.all([
    listMyBookings(supabase, user.id),
    listSavedGuides(supabase, user.id),
    listSavedExperiences(supabase, user.id),
  ])

  return (
    <TravelerTripsView
      locale={loc}
      t={messages.trips}
      reviewsT={messages.reviews}
      savesLabel={messages.explore.savesLabel}
      bookings={bookings}
      savedGuides={savedGuides}
      savedExperiences={savedExperiences}
    />
  )
}
