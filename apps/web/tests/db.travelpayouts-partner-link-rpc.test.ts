import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_restore_travelpayouts_partner_link_rpc.sql'))

expect(matches).toHaveLength(1)

const sql = readFileSync(join(migrationsDir, matches[0]), 'utf8')
const compact = sql.toLowerCase().replaceAll(/\s+/g, ' ')

describe('Travelpayouts partner-link persistence migration', () => {
  it('restores the trigger guard without weakening ordinary authenticated inserts', () => {
    expect(compact).toContain(
      'create or replace function app_private.prepare_affiliate_partner_link_insert()',
    )
    expect(compact).toContain(
      "current_setting('app.bypass_partner_link_prepare', true) = 'on'",
    )
    expect(compact).toContain("new.external_status := 'pending'")
    expect(compact).toContain("new.sub_id := 'pending:' || gen_random_uuid()::text")
  })

  it('creates the exact audited RPC signature', () => {
    expect(compact).toContain(
      'create or replace function public.create_travelpayouts_partner_link( p_affiliate_network_program_id uuid, p_mission_id uuid, p_mission_participant_id uuid, p_original_url text, p_partner_url text, p_sub_id text )',
    )
    expect(compact).toContain('returns table(id uuid, partner_url text)')
    expect(compact).toContain('security definer')
    expect(compact).toContain('set search_path = public')
  })

  it('derives and verifies the authenticated creator SubID', () => {
    expect(compact).toContain('v_actor_id uuid := auth.uid()')
    expect(compact).toContain("'kinnso_m_' || replace(p_mission_id::text, '-', '')")
    expect(compact).toContain("'_p_' || replace(p_mission_participant_id::text, '-', '')")
    expect(compact).toContain("'_c_' || replace(v_actor_id::text, '-', '')")
    expect(compact).toContain('if btrim(p_sub_id) <> v_expected_sub_id then')
  })

  it('accepts one exact query SubID and rejects all fragments', () => {
    expect(compact).toContain("v_original_url !~* '^https://[^[:space:]]+$'")
    expect(compact).toContain(
      "v_partner_url !~* '^https://(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)\\.)*tp\\.st/[^[:space:]#]*$'",
    )
    expect(compact).toContain("position('#' in v_partner_url) > 0")
    expect(compact).toContain("regexp_count(v_partner_url, '\\?') <> 1")
    expect(compact).toContain("regexp_count(v_partner_url, '[?&]sub_id=') <> 1")
    expect(compact).toContain(
      "v_partner_url !~ ('[?&]sub_id=' || v_expected_sub_id || '(&|$)')",
    )
    expect(compact).not.toContain(
      "v_partner_url !~ ('[?&]sub_id=' || v_expected_sub_id || '(&|#|$)')",
    )
  })

  it('scopes conflict fallback to the complete Travelpayouts mission identity', () => {
    const fallbackIndex = compact.indexOf('if v_inserted then return; end if;')
    const fallback = compact.slice(fallbackIndex)

    expect(fallback).toContain("link.network = 'travelpayouts'")
    expect(fallback).toContain('link.affiliate_network_program_id = p_affiliate_network_program_id')
    expect(fallback).toContain('link.mission_id = p_mission_id')
    expect(fallback).toContain('link.mission_participant_id = p_mission_participant_id')
  })
  it('revalidates ownership and active Travelpayouts mission state', () => {
    expect(compact).toContain('participant.creator_id = v_actor_id')
    expect(compact).toContain("participant.status = 'active'")
    expect(compact).toContain("mission.status = 'published'")
    expect(compact).toContain("mission.mission_source = 'travelpayouts'")
    expect(compact).toContain("program.network = 'travelpayouts'")
    expect(compact).toContain("program.status = 'active'")
  })

  it('scopes the bypass to the audited insert and restores the prior setting', () => {
    expect(compact).toContain(
      "v_previous_bypass_setting text := coalesce( current_setting('app.bypass_partner_link_prepare', true), '' )",
    )

    const validationIndex = compact.indexOf("raise exception 'partner link is not allowed'")
    const bypassIndex = compact.indexOf(
      "set_config('app.bypass_partner_link_prepare', 'on', true)",
    )
    const insertIndex = compact.indexOf('return query insert into public.affiliate_partner_links', bypassIndex)
    const insertResultCaptureIndex = compact.indexOf('v_inserted := found;', insertIndex)
    const restoreSql =
      "set_config('app.bypass_partner_link_prepare', v_previous_bypass_setting, true)"
    const restoreAfterInsertIndex = compact.indexOf(restoreSql, insertIndex)
    const successfulInsertReturnIndex = compact.indexOf(
      'if v_inserted then return; end if;',
      insertIndex,
    )

    expect(validationIndex).toBeGreaterThan(-1)
    expect(bypassIndex).toBeGreaterThan(validationIndex)
    expect(insertIndex).toBeGreaterThan(bypassIndex)
    expect(compact).toContain('v_inserted boolean')
    expect(insertResultCaptureIndex).toBeGreaterThan(insertIndex)
    expect(restoreAfterInsertIndex).toBeGreaterThan(insertResultCaptureIndex)
    expect(successfulInsertReturnIndex).toBeGreaterThan(restoreAfterInsertIndex)
    expect(compact.split(restoreSql)).toHaveLength(4)
    expect(compact).toContain('on conflict (network, sub_id, original_url) do nothing')
    expect(compact).toContain("link.external_status = 'success'")
  })

  it('revokes public, anon, and service-role execution and grants only authenticated execution', () => {
    expect(compact).toContain(
      'revoke all on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) from public, anon, authenticated, service_role',
    )
    expect(compact).toContain(
      'grant execute on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) to authenticated',
    )
    expect(compact).not.toContain(
      'grant execute on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) to anon',
    )
    expect(compact).not.toContain(
      'grant execute on function public.create_travelpayouts_partner_link( uuid, uuid, uuid, text, text, text ) to service_role',
    )
  })
})
