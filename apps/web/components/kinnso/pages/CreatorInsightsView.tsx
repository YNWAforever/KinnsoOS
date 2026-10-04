'use client'

import type en from '@/lib/i18n/messages/en'
import type { CreatorInsights } from '@/lib/insights/creator'
import { Sparkline } from '@/components/kinnso/Sparkline'
import { BarRow } from '@/components/kinnso/BarRow'

export function CreatorInsightsView({
  t,
  data,
}: {
  t: (typeof en)['insights']
  data: CreatorInsights
}) {
  const hasPoints = data.pointsTotal > 0
  const m = data.missionsByStatus
  const hasMissions = m.applied + m.active + m.invited + m.rejected + data.submissionsApproved > 0
  const typeMax = Math.max(1, data.pointsByType.guide_published, data.pointsByType.mission_verified, data.pointsByType.dna_scan)
  const nextLabel =
    data.tier.nextTier === null
      ? t.tierAtMax
      : t.pointsToNext.replace('{points}', String(data.tier.pointsForNext)).replace('{tier}', data.tier.nextTier)

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t.creatorTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.creatorSubtitle}</p>
      </header>

      <section className="rounded-lg border p-5">
        <p className="text-sm text-muted-foreground">{t.pointsTotal}</p>
        <p className="text-3xl font-semibold tabular-nums">{data.pointsTotal}</p>
        <p className="mt-1 text-sm text-muted-foreground">{nextLabel}</p>
      </section>

      <section className="rounded-lg border p-5">
        <p className="text-sm text-muted-foreground">{t.visitsDriven}</p>
        <p className="text-3xl font-semibold tabular-nums">{data.visitsDriven}</p>
      </section>

      {hasPoints ? (
        <>
          <section className="rounded-lg border p-5">
            <h2 className="mb-3 text-sm font-medium">{t.pointsTrajectory}</h2>
            <div className="text-primary">
              <Sparkline values={data.trajectory.map((p) => p.cumulative)} label={t.pointsTrajectory} />
            </div>
            {/* The sparkline is shape-only (aria-hidden polyline); expose the weekly
                cumulative series as text so screen-reader users get the actual data. */}
            <ol className="sr-only">
              {data.trajectory.map((p) => (
                <li key={p.weekStart}>{`${p.weekStart}: ${p.cumulative}`}</li>
              ))}
            </ol>
          </section>
          <section className="space-y-2 rounded-lg border p-5">
            <h2 className="mb-3 text-sm font-medium">{t.pointsByType}</h2>
            <BarRow label={t.typeGuide} value={data.pointsByType.guide_published} max={typeMax} />
            <BarRow label={t.typeMission} value={data.pointsByType.mission_verified} max={typeMax} />
            <BarRow label={t.typeScan} value={data.pointsByType.dna_scan} max={typeMax} />
          </section>
        </>
      ) : (
        <section className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          {t.creatorEmptyPoints}
        </section>
      )}

      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-5">
          <p className="text-sm text-muted-foreground">{t.guidesPublished}</p>
          <p className="text-2xl font-semibold tabular-nums">{data.guidesPublished}</p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-sm text-muted-foreground">{t.guideSaves}</p>
          <p className="text-2xl font-semibold tabular-nums">{data.guideSavesTotal}</p>
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-medium">{t.missionsTitle}</h2>
        {hasMissions ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">{t.statusApplied}</dt><dd className="text-lg tabular-nums">{m.applied}</dd></div>
            <div><dt className="text-muted-foreground">{t.statusActive}</dt><dd className="text-lg tabular-nums">{m.active}</dd></div>
            <div><dt className="text-muted-foreground">{t.statusInvited}</dt><dd className="text-lg tabular-nums">{m.invited}</dd></div>
            <div><dt className="text-muted-foreground">{t.statusRejected}</dt><dd className="text-lg tabular-nums">{m.rejected}</dd></div>
            <div><dt className="text-muted-foreground">{t.deliverables}</dt><dd className="text-lg tabular-nums">{data.submissionsApproved}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{t.creatorEmptyMissions}</p>
        )}
      </section>
    </main>
  )
}
