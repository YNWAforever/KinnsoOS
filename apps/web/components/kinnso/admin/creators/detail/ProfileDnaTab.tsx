import type { Messages } from '@/lib/i18n/messages/en'
import type { CreatorDetail } from '@/lib/admin/creators-queries'

type T = Messages['creators']
const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export function ProfileDnaTab({ t, detail }: { t: T; detail: CreatorDetail }) {
  const { dna, scan, socials, creator } = detail
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-kinnso-edge p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.detailBio}</p>
        <p className="text-sm text-kinnso-muted">{creator.bio ?? t.detailNoBio}</p>
      </section>
      <section className="rounded-xl border border-kinnso-edge p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secDna}</p>
        {dna ? (
          <dl className="text-sm text-kinnso-muted">
            <div className="flex justify-between"><dt>{t.scanStatus}</dt><dd className="text-kinnso-ink">{dna.status}</dd></div>
            <div className="flex justify-between"><dt>{t.detailUpdated}</dt><dd>{day(dna.updatedAt)}</dd></div>
          </dl>
        ) : <p className="text-sm text-kinnso-muted">{t.dnaNoData}</p>}
      </section>
      <section className="rounded-xl border border-kinnso-edge p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secScan}</p>
        {scan ? (
          <dl className="text-sm text-kinnso-muted">
            <div className="flex justify-between"><dt>{t.scanStatus}</dt><dd className="text-kinnso-ink">{scan.status}</dd></div>
            <div className="flex justify-between"><dt>{t.scanCompleted}</dt><dd>{day(scan.completedAt)}</dd></div>
            {scan.error ? <div className="mt-1 text-red-700">{t.scanError}: {scan.error}</div> : null}
          </dl>
        ) : <p className="text-sm text-kinnso-muted">{t.scanNoData}</p>}
      </section>
      <section className="rounded-xl border border-kinnso-edge p-4">
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secSocials}</p>
        {socials.length === 0 ? (
          <p className="text-sm text-kinnso-muted">{t.socialsNoData}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {socials.map((s) => (
              <li key={`${s.platform}:${s.handle}`} className="flex justify-between gap-2">
                <span className="font-bold text-kinnso-ink">{s.platform}</span>
                <span className="min-w-0 flex-1 truncate text-right text-kinnso-muted">{s.handle}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default ProfileDnaTab
