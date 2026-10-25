import { describeGuideSource, type GuideSourceSummary } from '@kinnso/journeys/lib/guides/source-summary.ts'
import { publication } from '@kinnso/journeys/lib/seo/guide-publication.ts'
import { publicGuide } from '@kinnso/journeys/lib/seo/public-guide.ts'

/**
 * Reader projection for a published guide.
 * The payload is the existing `kinnso_guide` contract, parsed and described
 * with the Journeys summary / itinerary distinction. A summary has no days.
 */
export type GuideSourceRow = {
  id: string
  title: string
  creatorName: string | null
  publishedAt: string | null
  cover: string | null
}

export type PublishedGuideDay = {
  id: string
  title: string
  stops: { id: string; title: string; description: string }[]
}

export type PublishedGuideSource =
  | { kind: 'summary'; source: GuideSourceSummary; summary: string }
  | { kind: 'itinerary'; source: GuideSourceSummary; days: PublishedGuideDay[] }
  | { kind: 'unavailable' }

type GuideRpcResult = { data: unknown; error: unknown }

export function projectPublishedGuideSource(
  payload: unknown,
  row: GuideSourceRow,
): Exclude<PublishedGuideSource, { kind: 'unavailable' }> {
  const parsed = publicGuide(payload)
  const source = describeGuideSource({
    ...parsed,
    publication: publication(parsed, {
      id: row.id,
      title: row.title,
      creator_name: row.creatorName,
      published_at: row.publishedAt,
      cover_url: row.cover,
    }),
  })
  if (parsed.kind === 'summary') return { kind: 'summary', source, summary: parsed.summary }
  return {
    kind: 'itinerary',
    source,
    days: parsed.days.map((day) => ({
      id: day.id,
      title: day.title,
      stops: day.stops.map((stop) => ({
        id: stop.id,
        title: stop.title,
        description: stop.description,
      })),
    })),
  }
}

/** Anonymous published-guide read. A schema or RPC failure does not invent an itinerary. */
export async function readPublishedGuideSource(
  load: () => PromiseLike<GuideRpcResult>,
  row: GuideSourceRow,
): Promise<PublishedGuideSource> {
  try {
    const result = await load()
    if (result.error || result.data == null) {
      console.error('guide-source-unconfirmed', { errorName: 'RpcError' })
      return { kind: 'unavailable' }
    }
    return projectPublishedGuideSource(result.data, row)
  } catch (error) {
    console.error('guide-source-unconfirmed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return { kind: 'unavailable' }
  }
}
