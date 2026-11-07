import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrationUrl} from './packaged-source.mjs';

test('operations team migration enforces one pending invite and idempotent audited state changes', async () => {
  const sql=await readFile(migrationUrl('20261106123312_harden_ops_team_lifecycle.sql',import.meta.url),'utf8');
  assert.match(sql,/create unique index if not exists kinnso_ops_invites_one_pending_email[\s\S]*lower\(email\)[\s\S]*where status = 'pending'/i);
  assert.match(sql,/grant select on public\.kinnso_ops_invites to authenticated/i);
  assert.match(sql,/raise exception 'already_ops_member'/i);
  assert.match(sql,/if v_current_role = p_role then return; end if/i);
  assert.match(sql,/if v_current_status = 'suspended' then return; end if/i);
  assert.match(sql,/if v_current_status = 'active' then return; end if/i);
  assert.match(sql,/if v_status = 'revoked' then\s+return;\s+end if/i);
  assert.match(sql,/grant execute on function public\.admin_invite_ops_member\(text, text\) to authenticated/i);
  assert.match(sql,/grant execute on function public\.admin_set_ops_member_role\(uuid, text, text\) to authenticated/i);
});
