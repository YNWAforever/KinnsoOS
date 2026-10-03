import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260719161738_r7_5_destination_index.sql',
)

describe('R7.5 destination index migration', () => {
  it('creates a read-only, invoker-secured published inventory view', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('create view public.destination_index')
    expect(sql).toContain('with (security_invoker = true)')
    expect(sql).toContain("where status = 'published'")
    expect(sql).toContain('guide_count')
    expect(sql).toContain('experience_count')
    expect(sql).toContain('latest_published_at')
    expect(sql).toContain('revoke all on public.destination_index from anon, authenticated')
    expect(sql).toContain(String.raw`btrim(regexp_replace(lower(observed_city), '[[:punct:][:space:]]+', ' ', 'g'))`)
    expect(sql).toContain(String.raw`btrim(regexp_replace(lower(btrim(term.value)), '[[:punct:][:space:]]+', ' ', 'g'))`)
    expect(sql).toContain('count(*) over (partition by generated_slug_base)')
    expect(sql).toContain('left(md5(city_key), 10)')
    expect(sql).toContain('partition by slug')
    expect(sql).toContain('other.generated_slug = c.slug')

    const grants = [...sql.matchAll(/grant\s+([^;]+?)\s+on\s+public\.destination_index\s+to\s+anon,\s*authenticated/g)]
      .map(([, privileges]) => privileges.trim().replace(/\s+/g, ' '))
    expect(grants).toEqual(['select'])
  })
})
