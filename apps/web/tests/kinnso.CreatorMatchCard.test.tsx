// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CreatorMatchCard from '@/components/kinnso/CreatorMatchCard'
import type { RankedCreator } from '@/lib/merchants/relevance'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const t = en.merchantSearch

const ranked = (over: Partial<RankedCreator['creator']> = {}, reasons: RankedCreator['reasons'] = []): RankedCreator => ({
  creator: {
    id: 'id-mai',
    handle: 'mai',
    name: 'Mai Tanaka',
    bio: 'Tokyo food',
    niches: ['food', 'coffee'],
    audienceGeos: ['HK'],
    languages: ['ja'],
    platforms: ['instagram'],
    guideCount: 4,
    lastGuideAt: '2026-02-01',
    ...over,
  },
  matched: reasons.length,
  reasons,
})

describe('CreatorMatchCard', () => {
  it('renders public-only attributes: name, handle, niches, guide count', () => {
    render(<CreatorMatchCard t={t} ranked={ranked()} saved={false} onSave={vi.fn()} onView={vi.fn()} onSendBrief={vi.fn()} />)
    expect(screen.getByText('Mai Tanaka')).toBeTruthy()
    expect(screen.getByText('@mai')).toBeTruthy()
    expect(screen.getByText('food')).toBeTruthy()
    expect(screen.getByText('coffee')).toBeTruthy()
    expect(screen.getByText('4 Guides')).toBeTruthy()
  })

  it('never surfaces follower counts, engagement rate, or a score', () => {
    render(<CreatorMatchCard t={t} ranked={ranked()} saved={false} onSave={vi.fn()} onView={vi.fn()} onSendBrief={vi.fn()} />)
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/\bER\b/)
    expect(body).not.toMatch(/follower/i)
    expect(body).not.toMatch(/\bscore\b/i)
    expect(body).not.toMatch(/\bReach\b/)
    // No fabricated score ring svg
    expect(document.querySelector('circle')).toBeNull()
  })

  it('renders reason chips from RankedCreator.reasons via i18n labels', () => {
    render(
      <CreatorMatchCard

        t={t}
        ranked={ranked({}, [
          { dimension: 'niche', values: ['food'] },
          { dimension: 'geo', values: ['HK'] },
        ])}
        saved={false}
        onSave={vi.fn()}
        onView={vi.fn()}
        onSendBrief={vi.fn()}
      />,
    )
    expect(screen.getByText(t.reasonNiche)).toBeTruthy()
    expect(screen.getByText(t.reasonGeo)).toBeTruthy()
  })

  it('has Save, View profile, and Send brief controls wired to callbacks', () => {
    const onSave = vi.fn(); const onView = vi.fn(); const onSendBrief = vi.fn()
    render(<CreatorMatchCard t={t} ranked={ranked()} saved={false} onSave={onSave} onView={onView} onSendBrief={onSendBrief} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.save) }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.viewProfile) }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.sendBrief) }))
    expect(onSave).toHaveBeenCalledWith('id-mai')
    expect(onView).toHaveBeenCalledWith('mai')
    expect(onSendBrief).toHaveBeenCalledWith('id-mai')
  })

  it('shows the saved label when already saved', () => {
    render(<CreatorMatchCard t={t} ranked={ranked()} saved onSave={vi.fn()} onView={vi.fn()} onSendBrief={vi.fn()} />)
    expect(screen.getByRole('button', { name: new RegExp(t.saved) })).toBeTruthy()
  })

  it('renders Market Passport ticket chrome', () => {
    render(<CreatorMatchCard t={t} ranked={ranked()} saved={false} onSave={vi.fn()} onView={vi.fn()} onSendBrief={vi.fn()} />)
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })
})
