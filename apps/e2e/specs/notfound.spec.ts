import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

for (const path of FIXTURES.notFound) {
  test(`404: ${path}`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status()).toBe(404)
  })
}
