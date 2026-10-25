// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GuideSourceBoundary } from '@/components/kinnso/GuideSourceBoundary'
import type { PublishedGuideSource } from '@/lib/guides/public-source'
import en from '@/lib/i18n/messages/en'
import zhHk from '@/lib/i18n/messages/zh-hk'

afterEach(() => cleanup())

const summary: PublishedGuideSource = {
  kind: 'summary',
  summary: 'Day 1: Temple. This sentence is prose, not a stop.',
  source: {
    kind: 'summary',
    authorName: 'Known author',
    version: null,
    publishedAt: '2026-10-19T00:00:00.000Z',
    dayCount: null,
    stopCount: null,
  },
}

const itinerary: PublishedGuideSource = {
  kind: 'itinerary',
  source: {
    kind: 'itinerary',
    authorName: 'Original author',
    version: 3,
    publishedAt: '2026-10-20T10:00:00.000Z',
    dayCount: 1,
    stopCount: 1,
  },
  days: [{
    id: 'day-1',
    title: 'Authored day',
    stops: [{ id: 'stop-1', title: 'Authored stop', description: 'Public description' }],
  }],
}

const adopt = <a href="https://planner.example/en/g/guide?adopt=1">Plan from this guide</a>

describe('GuideSourceBoundary', () => {
  it('shows a reading summary in English without an adopt control or invented stops', () => {
    render(<GuideSourceBoundary locale="en" view={summary} t={en.guideSource} planning={adopt} />)
    const source = screen.getByRole('complementary', { name: 'Guide source' })
    expect(source).toHaveTextContent('Reading summary — no structured itinerary')
    expect(source).toHaveTextContent('Known author')
    expect(source).toHaveTextContent('Not recorded')
    expect(source).toHaveTextContent('Publication time is not a verification date.')
    expect(source.querySelector('time')).toHaveAttribute('dateTime', '2026-10-19T00:00:00.000Z')
    expect(screen.getByText('Day 1: Temple. This sentence is prose, not a stop.').tagName).toBe('P')
    expect(screen.queryByRole('heading', { name: /Temple/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Plan from this guide' })).toBeNull()
    expect(document.body.innerHTML).not.toContain('adopt=1')
    expect(source).not.toHaveTextContent('Days / stops')
  })

  it('shows the same summary boundary in zh-HK', () => {
    render(<GuideSourceBoundary locale="zh-hk" view={summary} t={zhHk.guideSource} planning={adopt} />)
    const source = screen.getByRole('complementary', { name: '攻略來源' })
    expect(source).toHaveAttribute('lang', 'zh-Hant-HK')
    expect(source).toHaveTextContent('閱讀摘要 — 未提供結構化行程')
    expect(source).toHaveTextContent('未記錄')
    expect(source).toHaveTextContent('發布時間不等於查核日期。')
    expect(screen.getByText('這是摘要攻略，未提供可套用的結構化行程。')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Plan from this guide' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('keeps a structured itinerary and its adopt control limited to the supplied stops', () => {
    render(<GuideSourceBoundary locale="en" view={itinerary} t={en.guideSource} planning={adopt} />)
    expect(screen.getByText('Structured itinerary')).toBeTruthy()
    expect(screen.getByText('v3')).toBeTruthy()
    expect(screen.getByText('1 / 1')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Authored day' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Authored stop' })).toBeTruthy()
    expect(screen.getByText('Public description')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Plan from this guide' })).toHaveAttribute('href', expect.stringContaining('adopt=1'))
    expect(screen.queryByRole('heading', { name: 'Invented stop' })).toBeNull()
  })

  it('does not render stops or an adopt control when the source was not confirmed', () => {
    render(<GuideSourceBoundary locale="en" view={{ kind: 'unavailable' }} t={en.guideSource} planning={adopt} />)
    expect(screen.getByRole('status')).toHaveTextContent(en.guideSource.unavailable)
    expect(screen.queryByRole('link', { name: 'Plan from this guide' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    expect(document.body.innerHTML).not.toContain('adopt=1')
  })
})
