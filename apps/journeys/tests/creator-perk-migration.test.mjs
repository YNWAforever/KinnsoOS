import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('forward perk migration qualifies table columns that collide with RETURNS TABLE outputs', async () => {
  const sql = await readFile(new URL('../../../supabase/migrations/20261106110000_fix_redeem_perk_ambiguity.sql', import.meta.url), 'utf8');
  assert.match(sql, /select p\.min_tier, p\.redemption_type, p\.redemption_value/i);
  assert.match(sql, /from public\.partner_perks p/i);
  assert.match(sql, /on conflict \(creator_id, perk_id\) do nothing/i);
  assert.match(sql, /grant execute on function public\.redeem_perk\(uuid\) to authenticated/i);
});
