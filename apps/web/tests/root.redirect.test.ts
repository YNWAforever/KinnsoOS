import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'

const redirectMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

describe('root route', () => {
  beforeEach(() => {
    redirectMock.mockReset()
  })

  it('redirects the bare root to the default locale', async () => {
    expect(fs.existsSync(path.join(process.cwd(), 'app/page.tsx'))).toBe(true)

    const { default: RootPage } = await import('@/app/page')
    RootPage()

    expect(redirectMock).toHaveBeenCalledWith(`/${DEFAULT_LOCALE}`)
  })
})
