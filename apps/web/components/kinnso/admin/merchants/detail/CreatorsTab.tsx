import type { Messages } from '@/lib/i18n/messages/en'
import type { MerchantDetail } from '@/lib/admin/merchants-queries'

type T = Messages['merchantsOps']

export function CreatorsTab({ t, creators }: { t: T; creators: MerchantDetail['creators'] }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secSaved}</p>
        <p className="text-2xl font-black text-kinnso-ink">{creators.savedCount} <span className="text-sm font-bold text-kinnso-muted">{t.savedCount}</span></p>
      </section>
      <section>
        <p className="mb-2 text-sm font-bold text-kinnso-ink">{t.secEngaged}</p>
        {creators.engaged.length === 0 ? (
          <p className="py-4 text-sm text-kinnso-muted">{t.creatorsEmpty}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-kinnso-muted">
              <tr className="border-b border-kinnso-edge">
                <th className="py-2 font-bold">{t.colCreator}</th>
                <th className="py-2 font-bold">{t.colHandle}</th>
                <th className="py-2 font-bold">{t.colParticipantStatus}</th>
              </tr>
            </thead>
            <tbody>
              {creators.engaged.map((e) => (
                <tr key={e.creatorId} className="border-b border-kinnso-edge/60">
                  <td className="py-2 font-bold text-kinnso-ink">{e.displayName ?? e.handle ?? e.creatorId}</td>
                  <td className="py-2 text-kinnso-muted">{e.handle ? `@${e.handle}` : '—'}</td>
                  <td className="py-2 text-kinnso-muted">{e.participantStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default CreatorsTab
