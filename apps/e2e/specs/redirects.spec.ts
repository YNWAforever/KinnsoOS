import { test, expect } from '@playwright/test'
import { FIXTURES } from '../fixtures'

// The proxy emits a relative Location header (e.g. "/en/articles/dining/ramen-guide"),
// which is valid per RFC 7231. Resolve it against baseURL before reading .pathname so the
// assertion works whether the header is relative or absolute (mirrors the parity check).
test('legacy /post redirect → 301 → locale-prefixed article', async ({ request, page, baseURL }) => {
  const res = await request.get(FIXTURES.redirect.from, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(new URL(res.headers()['location'], baseURL).pathname).toBe(FIXTURES.redirect.to)

  await page.goto(FIXTURES.redirect.from)
  expect(new URL(page.url()).pathname).toBe(FIXTURES.redirect.to)
})

test('locale-prefixed legacy redirect preserves the locale', async ({ request, baseURL }) => {
  const res = await request.get(FIXTURES.redirectHk.from, { maxRedirects: 0 })
  expect(res.status()).toBe(301)
  expect(new URL(res.headers()['location'], baseURL).pathname).toBe(FIXTURES.redirectHk.to)
})

// R2B: most merchant routes moved under /merchants/dashboard/* — old URLs are in-repo
// permanentRedirect (308) stubs, not seo_redirects rows. The legacy paths are
// deliberately NOT in the proxy's auth gate, so anon requests get the 308 first
// (the dashboard target then handles its own gating).
const MERCHANT_MOVES = [
  ['/en/merchants/missions', '/en/merchants/dashboard/missions'],
  ['/en/merchants/creators', '/en/merchants/dashboard/creators'],
  ['/en/merchants/insights', '/en/merchants/dashboard/insights'],
] as const

for (const [from, to] of MERCHANT_MOVES) {
  test(`legacy merchant route ${from} 308s to ${to}`, async ({ request, baseURL }) => {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(new URL(res.headers()['location'], baseURL).pathname).toBe(to)
  })
}

// The existing post entry is a role-aware dispatcher, preserved on main. An
// anonymous viewer is sent to apply; fresh merchant authorization selects dashboard.
for (const locale of ['en', 'zh-hk']) {
  test(`anonymous /${locale}/merchants/post keeps the apply entry`, async ({ request, baseURL }) => {
    const res = await request.get(`/${locale}/merchants/post`, { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(new URL(res.headers()['location'], baseURL).pathname).toBe(`/${locale}/merchants/apply`)
  })
}
