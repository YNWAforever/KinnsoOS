import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), '../../supabase/migrations')
const file = readdirSync(migrationsDir).find((name) => name.endsWith('_r7_3_production_honesty.sql'))

expect(file).toBeTruthy()

const sql = readFileSync(join(migrationsDir, file!), 'utf8')
const cleanupFile = readdirSync(migrationsDir).find((name) => name.endsWith('_r7_3_honesty_cleanup.sql'))

expect(cleanupFile).toBeTruthy()

const cleanupSql = readFileSync(join(migrationsDir, cleanupFile!), 'utf8')
const liveTestPath = join(process.cwd(), 'tests/r7-3-creator-listing.rls.test.ts')
const liveTest = readFileSync(liveTestPath, 'utf8')
const liveConfigPath = join(process.cwd(), 'tests/helpers/r7-3-local-live-config.ts')
const liveConfig = readFileSync(liveConfigPath, 'utf8')

describe('R7.3 production-honesty migration', () => {
  it('captures the structural, recompute, listing-policy, and editorial contracts', () => {
    expect(sql).toContain('alter table public.guides alter column cover_url drop not null')
    expect(sql).toContain('select count(*)::int from public.guide_saves')
    expect(sql).toContain('add column if not exists is_listed boolean not null default false')
    expect(sql).toContain('create or replace function public.admin_set_creator_listed')
    expect(sql).toContain("perform public.ops_audit_log_append('creator'")
    expect(sql).toMatch(/revoke all on function public\.admin_set_creator_listed\(uuid, boolean, text\) from public, anon/)
    expect(sql).toMatch(/grant execute on function public\.admin_set_creator_listed\(uuid, boolean, text\) to authenticated/)
    expect(sql).toContain('create trigger creators_protect_is_listed')
    expect(sql).toContain("'kinnso-editorial'")
  })

  it('reserves is_listed updates for the audited RPC at the privilege boundary', () => {
    expect(sql).toContain('revoke update on public.creators from authenticated')
    const grant = sql.match(/grant update\s*\(([^)]+)\)\s*on public\.creators\s*to authenticated/i)
    expect(grant).not.toBeNull()
    expect(grant![1]).toContain('display_name')
    expect(grant![1]).toContain('status')
    expect(grant![1]).not.toContain('is_listed')
  })

  it('locks the creator row before deriving audited listing metadata', () => {
    expect(sql).toContain('select is_listed into v_from from public.creators where id = p_id for update')
  })

  it('requires explicit local-only opt-in before constructing a service-role client', () => {
    expect(liveConfig).toContain('RUN_R7_3_LOCAL_LIVE_TESTS')
    expect(liveTest).toContain('resolveR73LocalLiveConfig')
    expect(liveTest).toMatch(/const svc\s*=\s*liveConfig\s*\?\s*createClient/)
    expect(liveTest).toMatch(/:\s*null/)
  })

  it('executes the migration recompute against a drifted local guide with a real save', () => {
    expect(liveConfig).toContain('SUPABASE_DB_CONTAINER')
    expect(liveTest).toContain('runPsql(recomputeSql)')
    expect(liveTest).toContain("expect(afterRecompute.data!.saves_count).toBe(1)")
  })
})

describe('R7.3 production-honesty cleanup migration', () => {
  it('unpublishes only the exact audited article id and slug pairs', () => {
    expect(cleanupSql).toContain('update public.articles as article')
    expect(cleanupSql).toContain('from (values')
    expect(cleanupSql).toContain("('00000000-0000-0000-0000-000000000001'::uuid, 'pub-article')")
    expect(cleanupSql).toContain("('00000000-0000-0000-0000-0000000000a1'::uuid, 'ramen-guide')")
    expect(cleanupSql).toContain("('00000000-0000-0000-0000-0000000000a2'::uuid, 'sushi-guide')")
    expect(cleanupSql).toContain("('00000000-0000-0000-0000-0000000000a3'::uuid, 'cafe-guide')")
    expect(cleanupSql).toContain("('00000000-0000-0000-0000-0000000000a4'::uuid, 'mall-coupon')")
    expect(cleanupSql).toContain("('00000000-0000-0000-0000-000000000003'::uuid, 'expired-article')")
    expect(cleanupSql).toContain('article.id = target.id')
    expect(cleanupSql).toContain('article.slug = target.slug')
    expect(cleanupSql).toContain('article.published_at is not null')
  })

  it('clears only audited invalid guide covers and merchant websites', () => {
    expect(cleanupSql).toContain("cover_url ~* '^https://picsum\\.photos(?:/|$)'")
    for (const id of [
      'c1219eec-8da0-d78d-7335-f2785d31187e',
      '02425dc3-b5c6-4b10-c9cb-fab2118ad58b',
      '04534d55-16f8-95ba-b50e-976fd12a630c',
      '14e65377-ea50-7c58-fd26-bae99d221caa',
    ]) {
      expect(cleanupSql).toContain(`'${id}'::uuid`)
    }
    expect(cleanupSql).toContain('website_url is not null')
    expect(cleanupSql).toContain("website_url !~* '^https://'")
    expect(cleanupSql).toContain("website_url ~* '^https://[^/]*(^|\\.)example\\.[^/]+'")
  })

  it('removes only the audited author and ramen map reference without assigning editorial', () => {
    const authorCleanup = cleanupSql.match(
      /update public\.articles as article\s+set authors = array_remove\(article\.authors, 'jane-doe'\)[\s\S]*?;/,
    )?.[0]
    expect(authorCleanup).toBeTruthy()
    expect(authorCleanup).toContain('from (values')
    expect(authorCleanup).toContain("('00000000-0000-0000-0000-000000000001'::uuid, 'pub-article')")
    expect(authorCleanup).toContain("('00000000-0000-0000-0000-000000000003'::uuid, 'expired-article')")
    expect(authorCleanup).toContain('article.id = target.id')
    expect(authorCleanup).toContain('article.slug = target.slug')
    expect(authorCleanup).toContain("'jane-doe' = any(article.authors)")
    expect(cleanupSql).toContain("where slug = 'jane-doe'")
    expect(cleanupSql).toContain('and not exists')
    expect(cleanupSql).toContain("content #- '{3,address,link}'")
    expect(cleanupSql).toContain("translation.article_id = '00000000-0000-0000-0000-0000000000a1'::uuid")
    expect(cleanupSql).toContain("translation.locale = 'en'")
    expect(cleanupSql).toContain("translation.content #>> '{3,address,link}' = 'https://maps.example/x'")
    expect(cleanupSql).not.toContain("set authors = '{kinnso-editorial}'")
    expect(cleanupSql).not.toContain('source is null')
  })
})
