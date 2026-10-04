import type { Check, CheckResult, LegacySource } from '../types'
import type { SeoLossEntry } from '../sources/mysql-derive'

type MaybeClassifying = LegacySource & { seoLoss?: () => Promise<SeoLossEntry[]> }

/**
 * URLs the legacy site serves today that the new stack will deliberately NOT publish.
 *
 * These exist because `transform/index.ts` runs `validatePublication` and unpublishes the
 * whole article on a content-quality warning. They are invisible to every other check:
 * they are absent from the new stack, so `url-coverage` never sees them, and absent from
 * the baseline's expected set, so `sitemap-superset` never sees them either. Without this
 * check they are a silent 404 on cutover day.
 *
 * A loss is forgiven only when a redirect covers it — the URL still resolves (301), so no
 * link rots. Anything else is a `fail`, never a `warn`: `buildReport` is
 * `ok: counts.fail === 0`, so a warn would exit 0 and certify the loss.
 */
export const seoLoss: Check = async ({ legacy }) => {
  const source = legacy as MaybeClassifying
  if (typeof source.seoLoss !== 'function') {
    // Fixture and sitemap baselines cannot know this; say so rather than implying zero loss.
    return [
      {
        check: 'seo-loss',
        target: '(baseline)',
        status: 'warn',
        detail: 'this baseline mode cannot determine deliberate publication drops',
      },
    ]
  }

  const entries = await source.seoLoss()
  const unrescued = entries.filter((e) => e.unrescuedPaths.length > 0)

  if (unrescued.length === 0) {
    const rescued = entries.length
    return [
      {
        check: 'seo-loss',
        target: '(all articles)',
        status: 'pass',
        detail:
          rescued === 0
            ? 'no articles are dropped by the publication gate'
            : `${rescued} dropped article(s), every path covered by a redirect`,
      },
    ]
  }

  const paths = unrescued.flatMap((e) => e.unrescuedPaths)
  const out: CheckResult[] = [
    {
      check: 'seo-loss',
      target: '(all articles)',
      status: 'fail',
      // Report BOTH counts: validatePublication nulls published_at article-wide, so one
      // thin locale takes every other locale of the same article down with it.
      detail: `${paths.length} URL(s) across ${unrescued.length} article(s) go dark with no redirect`,
    },
  ]

  for (const entry of unrescued.slice(0, 25)) {
    out.push({
      check: 'seo-loss',
      target: entry.unrescuedPaths[0],
      status: 'fail',
      detail:
        `#${entry.view.legacyPostId} ${entry.reason}` +
        (entry.reasonCodes.length ? ` (${entry.reasonCodes.join(', ')})` : ''),
    })
  }
  return out
}
