import { TicketCard } from '@/components/kinnso/MarketPassport'

export function KpiCard({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <TicketCard className="p-5">
      <p className="text-3xl font-black text-kinnso-ink">{value}</p>
      <p className="mt-1 text-sm text-kinnso-muted">{label}</p>
      {delta !== undefined && (
        <p className={`mt-1 text-xs font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {delta >= 0 ? `+${delta}` : `${delta}`}
        </p>
      )}
    </TicketCard>
  )
}

export default KpiCard
