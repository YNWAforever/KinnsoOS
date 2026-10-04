import Link from 'next/link'
import { EditorialCard } from '@/components/kinnso/editorial/EditorialCard'
import type { PublicSession } from '@/lib/sessions/public-queries'
import type { Locale } from '@/lib/i18n/config'

const SessionCard = ({ session, locale }: { session: PublicSession; locale: Locale }) => {
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <Link href={`/${locale}/sessions/${session.slug}`} className="group">
      <EditorialCard kicker={dateTimeFmt.format(new Date(session.startsAt))} title={session.title}>
        {session.host ? `@${session.host.handle}` : null}
      </EditorialCard>
    </Link>
  )
}

export default SessionCard
