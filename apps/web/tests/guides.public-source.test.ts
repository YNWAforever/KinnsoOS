import { describe, expect, it, vi } from 'vitest'
import { describeGuideSource } from '@kinnso/journeys/lib/guides/source-summary.ts'
import { publication } from '@kinnso/journeys/lib/seo/guide-publication.ts'
import { publicGuide } from '@kinnso/journeys/lib/seo/public-guide.ts'
import {
  projectPublishedGuideSource,
  readPublishedGuideSource,
  type GuideSourceRow,
} from '@/lib/guides/public-source'

const row: GuideSourceRow = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Author text',
  creatorName: 'Row author',
  publishedAt: '2026-06-02T00:00:00.000Z',
  cover: 'https://cdn.kinnso.ai/test/guide.jpg',
}

const summaryPayload = {
  kind: 'summary',
  id: row.id,
  title: row.title,
  summary: 'No structured stops',
  destinationId: null,
  days: [{ title: 'Invented day', stops: [{ title: 'Invented stop', description: 'Do not render' }] }],
  verifiedAt: 'FAKE',
  authorLocale: 'FAKE',
  privateContact: 'PRIVATE',
}

function stop(id: string, title: string, description: string) {
  return {
    id,
    title,
    description,
    placeId: null,
    position: 0,
    startMinuteOfDay: null,
    durationMinutes: null,
    source: null,
    travellerNote: 'PRIVATE retained note',
  }
}

const itineraryPayload = {
  kind: 'itinerary',
  id: row.id,
  title: row.title,
  destinationId: null,
  version: 7,
  publishedAt: '2026-10-20T10:00:00.000Z',
  creator: { id: 'author', name: 'Original author', handle: null },
  days: [
    {
      id: 'day-1',
      offset: 0,
      title: 'First day',
      stops: [stop('stop-1', 'First stop', 'Public one'), stop('stop-2', 'Second stop', 'Public two')],
    },
    {
      id: 'day-2',
      offset: 1,
      title: 'Second day',
      stops: [stop('stop-3', 'Third stop', 'Public three')],
    },
  ],
  privateNote: 'DO_NOT_PROJECT',
  verifiedAt: 'FAKE',
}

describe('published guide source projection', () => {
  it('describes a GuideForm summary with the Journeys source card and no days', () => {
    const projected = projectPublishedGuideSource(summaryPayload, row)
    const parsed = publicGuide(summaryPayload)
    expect(projected.kind).toBe('summary')
    if (projected.kind !== 'summary') return
    expect(projected.summary).toBe('No structured stops')
    expect(projected).not.toHaveProperty('days')
    expect(projected.source).toEqual(describeGuideSource({
      ...parsed,
      publication: publication(parsed, {
        id: row.id,
        title: row.title,
        creator_name: row.creatorName,
        published_at: row.publishedAt,
        cover_url: row.cover,
      }),
    }))
    expect(projected.source).toEqual({
      kind: 'summary',
      authorName: 'Row author',
      version: null,
      publishedAt: row.publishedAt,
      dayCount: null,
      stopCount: null,
    })
    expect(JSON.stringify(projected)).not.toContain('Invented stop')
    expect(JSON.stringify(projected)).not.toContain('PRIVATE')
    expect(JSON.stringify(projected)).not.toContain('FAKE')
  })

  it('counts only the structured days and stops the contract returned', () => {
    const projected = projectPublishedGuideSource(itineraryPayload, { ...row, creatorName: 'Supplemental author' })
    expect(projected.kind).toBe('itinerary')
    if (projected.kind !== 'itinerary') return
    expect(projected.source).toEqual({
      kind: 'itinerary',
      authorName: 'Original author',
      version: 7,
      publishedAt: '2026-10-20T10:00:00.000Z',
      dayCount: 2,
      stopCount: 3,
    })
    expect(projected.days.map((day) => day.stops.map((item) => item.title))).toEqual([
      ['First stop', 'Second stop'],
      ['Third stop'],
    ])
    expect(JSON.stringify(projected)).not.toContain('PRIVATE')
    expect(JSON.stringify(projected)).not.toContain('DO_NOT_PROJECT')
  })

  it('keeps an empty structured itinerary at zero stops', () => {
    const projected = projectPublishedGuideSource({
      ...itineraryPayload,
      creator: { id: 'author', name: '   ', handle: null },
      days: [],
    }, row)
    expect(projected.kind).toBe('itinerary')
    if (projected.kind !== 'itinerary') return
    expect(projected.source.dayCount).toBe(0)
    expect(projected.source.stopCount).toBe(0)
    expect(projected.source.authorName).toBeNull()
    expect(projected.days).toEqual([])
  })

  it('does not invent a summary or an itinerary when the RPC cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const missing = await readPublishedGuideSource(async () => ({ data: null, error: { message: 'guide_not_found' } }), row)
    const malformed = await readPublishedGuideSource(async () => ({
      data: { kind: 'itinerary', id: row.id, title: row.title, days: [{ title: 'Invented day' }] },
      error: null,
    }), row)
    const mismatched = await readPublishedGuideSource(async () => ({
      data: { ...summaryPayload, title: 'Different title' },
      error: null,
    }), row)
    expect(missing).toEqual({ kind: 'unavailable' })
    expect(malformed).toEqual({ kind: 'unavailable' })
    expect(mismatched).toEqual({ kind: 'unavailable' })
    expect(JSON.stringify([missing, malformed, mismatched])).not.toContain('Invented')
    error.mockRestore()
  })
})
