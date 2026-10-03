import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anonKey = process.env.SUPABASE_ANON_KEY ?? 'missing'
const d = svcKey && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? describe : describe.skip
const hookTimeout = 60000
const testTimeout = 15000
const svc = createClient(url, svcKey ?? 'missing')
const anon = createClient(url, anonKey)
const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const password = 'Test1234!destination'
const slugs = {
  guide: `r75-punctuation-guide-${runId}`,
  experience: `r75-punctuation-experience-${runId}`,
  gamma: `r75-gamma-guide-${runId}`,
  delta: `r75-delta-guide-${runId}`,
  stJohns: `r75-st-johns-${runId}`,
  shared: `r75-shared-${runId}`,
}
let creatorId = ''
let merchantUserId = ''
let merchantProfileId = ''
const guideIds: string[] = []
const experienceIds: string[] = []

d('R7.5 destination index normalization and curated slug allocation (live Postgres)', () => {
  beforeAll(async () => {
    const creator = await svc.auth.admin.createUser({ email: `r75-destination-creator-${runId}@example.test`, password, email_confirm: true })
    expect(creator.error, `create creator failed: ${creator.error?.message}`).toBeNull()
    creatorId = creator.data.user!.id
    const merchantUser = await svc.auth.admin.createUser({ email: `r75-destination-merchant-${runId}@example.test`, password, email_confirm: true })
    expect(merchantUser.error, `create merchant failed: ${merchantUser.error?.message}`).toBeNull()
    merchantUserId = merchantUser.data.user!.id
    const merchant = await svc.from('merchant_profiles').insert({ user_id: merchantUserId, company_name: `R7.5 Destination Merchant ${runId}`, contact_email: `r75-destination-merchant-${runId}@example.test` }).select('id').single()
    expect(merchant.error).toBeNull()
    merchantProfileId = merchant.data!.id
    const createdDestinations = await svc.from('destinations').insert([
      { slug: slugs.stJohns, name: 'St Johns', match_terms: ['St.Johns'], status: 'published', published_at: new Date().toISOString() },
      { slug: slugs.shared, name: 'Shared city alias', match_terms: ['Gamma', 'Delta'], status: 'published', published_at: new Date().toISOString() },
    ])
    expect(createdDestinations.error).toBeNull()
    const guides = await svc.from('guides').insert([
      { creator_id: creatorId, creator_handle: `r75-${runId}`, creator_name: 'R7.5 Destination Creator', slug: slugs.guide, title: 'Punctuation guide', summary: 'Local destination-index regression fixture.', cover_url: 'https://example.test/guide.jpg', city: 'St. Johns', status: 'published', published_at: new Date().toISOString() },
      { creator_id: creatorId, creator_handle: `r75-${runId}`, creator_name: 'R7.5 Destination Creator', slug: slugs.gamma, title: 'Gamma guide', summary: 'Local destination-index regression fixture.', cover_url: 'https://example.test/gamma.jpg', city: 'Gamma', status: 'published', published_at: new Date().toISOString() },
      { creator_id: creatorId, creator_handle: `r75-${runId}`, creator_name: 'R7.5 Destination Creator', slug: slugs.delta, title: 'Delta guide', summary: 'Local destination-index regression fixture.', cover_url: 'https://example.test/delta.jpg', city: 'Delta', status: 'published', published_at: new Date().toISOString() },
    ]).select('id')
    expect(guides.error).toBeNull()
    guideIds.push(...(guides.data ?? []).map((row) => row.id))
    const experience = await svc.from('experiences').insert({ merchant_profile_id: merchantProfileId, slug: slugs.experience, title: 'Punctuation experience', city: 'St Johns', price_amount: 100, currency: 'HKD', status: 'published', published_at: new Date().toISOString() }).select('id')
    expect(experience.error).toBeNull()
    if (experience.data?.[0]?.id) experienceIds.push(experience.data[0].id)
  }, hookTimeout)

  afterAll(async () => {
    if (experienceIds.length > 0) await svc.from('experiences').delete().in('id', experienceIds)
    if (guideIds.length > 0) await svc.from('guides').delete().in('id', guideIds)
    await svc.from('destinations').delete().in('slug', [slugs.stJohns, slugs.shared])
    if (merchantProfileId) await svc.from('merchant_profiles').delete().eq('id', merchantProfileId)
    if (creatorId) await svc.auth.admin.deleteUser(creatorId)
    if (merchantUserId) await svc.auth.admin.deleteUser(merchantUserId)
  }, hookTimeout)

  it('coalesces punctuation and whitespace city variants, then matches the curated punctuation alias', async () => {
    const result = await anon.from('destination_index').select('slug,name,guide_count,experience_count').eq('slug', slugs.stJohns)
    expect(result.error).toBeNull()
    expect(result.data).toEqual([{ slug: slugs.stJohns, name: 'St Johns', guide_count: 1, experience_count: 1 }])
  }, testTimeout)

  it('never assigns one curated alias slug to two independent city rows', async () => {
    const result = await anon.from('destination_index').select('slug,name').in('name', ['Gamma', 'Delta', 'Shared city alias'])
    expect(result.error).toBeNull()
    const rows = result.data ?? []
    expect(rows.filter((row) => row.slug === slugs.shared)).toHaveLength(1)
    expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length)
  }, testTimeout)
})
