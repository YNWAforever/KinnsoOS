// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getDictionaryMock, useParamsMock } = vi.hoisted(() => ({
  getDictionaryMock: vi.fn(),
  useParamsMock: vi.fn(() => ({ locale: 'zh-hk' })),
}))

vi.mock('next/navigation', () => ({ useParams: useParamsMock }))
vi.mock('@/lib/i18n/dictionaries', () => ({ getDictionary: getDictionaryMock }))

describe('DetailRouteError', () => {
  beforeEach(async () => {
    getDictionaryMock.mockReset()
    getDictionaryMock.mockResolvedValue((await import('@/lib/i18n/messages/zh-hk')).default)
  })

  it('loads localized copy, retries the route, and links back to explore', async () => {
    const reset = vi.fn()
    const { DetailRouteError } = await import('@/components/kinnso/DetailRouteError')

    render(<DetailRouteError error={Object.assign(new Error('route failed'), { digest: 'digest-123' })} reset={reset} />)

    expect(screen.getByRole('heading', { name: "We couldn't load this page" })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Explore' })).toHaveAttribute('href', '/zh-hk/explore')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '暫時未能載入此頁面' })).toBeTruthy()
    })
    expect(screen.getByText('載入時遇到暫時問題。請再試一次，或繼續探索。')).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回探索' })).toHaveAttribute('href', '/zh-hk/explore')

    fireEvent.click(screen.getByRole('button', { name: '再試一次' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(getDictionaryMock).toHaveBeenCalledWith('zh-hk')
  })
})
