import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrationUrl} from './packaged-source.mjs';

test('forward perk migration qualifies table columns that collide with RETURNS TABLE outputs', async () => {
  const sql = await readFile(migrationUrl('20261106110000_fix_redeem_perk_ambiguity.sql', import.meta.url), 'utf8');
  assert.match(sql, /select p\.min_tier, p\.redemption_type, p\.redemption_value/i);
  assert.match(sql, /from public\.partner_perks p/i);
  assert.match(sql, /on conflict \(creator_id, perk_id\) do nothing/i);
  assert.match(sql, /grant execute on function public\.redeem_perk\(uuid\) to authenticated/i);
});

test('perk entitlement is checked after active lookup and before the first-redemption tier gate', async () => {
 const sql=await readFile(migrationUrl('20261108130000_restore_redeemed_perk_entitlement.sql',import.meta.url),'utf8');
 const active=sql.indexOf('and p.active'), entitlement=sql.indexOf('from public.perk_redemptions r'),tier=sql.indexOf('public.contribution_tier_rank');
 assert.ok(active>=0&&active<entitlement&&entitlement<tier);
 assert.match(sql,/r\.creator_id = v_uid and r\.perk_id = p_perk_id/i);
 assert.match(sql,/on conflict \(creator_id, perk_id\) do nothing/i);
 assert.match(sql,/revoke all on function public\.redeem_perk\(uuid\) from public, anon/i);
 assert.match(sql,/grant execute on function public\.redeem_perk\(uuid\) to authenticated/i);
});
