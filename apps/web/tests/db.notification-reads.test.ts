import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r10_3_notification_reads.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r10.3 notification read RPCs', () => {
  it('applies after the trigger migrations', () => {
    expect(matches[0] > '20260817090150').toBe(true)
  })

  it('notifications_mine gates on the same active-creator check as every R10.0-R10.2 read', () => {
    expect(sql).toContain('create or replace function public.notifications_mine()')
    expect(sql).toContain("if not exists (select 1 from public.creators where id = v_uid and status = 'active') then")
  })

  it('notifications_mine scopes to the caller, orders newest first, and caps at 50', () => {
    expect(sql).toContain('where creator_id = v_uid')
    expect(sql).toContain('order by n.created_at desc')
    expect(sql).toContain('limit 50')
  })

  it('notifications_unread_count uses the same gate and the partial unread index', () => {
    expect(sql).toContain('create or replace function public.notifications_unread_count()')
    expect(sql).toContain('where creator_id = v_uid and read_at is null')
  })

  it('both revoke from every client role except a grant to authenticated', () => {
    expect(sql).toContain('revoke all on function public.notifications_mine() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.notifications_mine() to authenticated')
    expect(sql).toContain('revoke all on function public.notifications_unread_count() from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.notifications_unread_count() to authenticated')
  })
})
