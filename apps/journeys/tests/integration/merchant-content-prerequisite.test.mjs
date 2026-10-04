import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fixture,admin} from './local-fixtures.mjs';
const ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};

test('merchant content prerequisite preserves existing brief content, fills absent columns and rejects incompatible types',async()=>{
 const f=await fixture();let merchantId;
 try{
  const owner=await f.actor();merchantId=randomUUID();
  await ok(admin.from('merchant_profiles').insert({id:merchantId,user_id:owner.id,company_name:'Synthetic prerequisite merchant',contact_email:'synthetic@example.test'}));
  const sql=fs.readFileSync(new URL('../../../../supabase/migrations/20261003204655_add_merchant_branch_commands.sql',import.meta.url),'utf8');
  const block=sql.match(/do \$content_prerequisite\$[\s\S]*?end \$content_prerequisite\$;/i)?.[0];
  assert.ok(block,'The candidate must supply its missing historical content prerequisite');
  const session=await owner.client.auth.getSession();assert.equal(session.error,null);
  const jwt=JSON.parse(Buffer.from(session.data.session.access_token.split('.')[1],'base64url').toString());assert.equal(jwt.sub,owner.id);assert.match(jwt.session_id,/^[0-9a-f-]{36}$/i);
  const claims=JSON.stringify({sub:owner.id,session_id:jwt.session_id,role:'authenticated',is_anonymous:false});
  const inspect=spawnSync('docker',['inspect',process.env.KINNSO_TEST_DB_CONTAINER],{encoding:'utf8'});assert.equal(inspect.status,0,inspect.stderr);assert.equal(JSON.parse(inspect.stdout)[0].Config.Labels['com.supabase.cli.project'],'kinnsoos-b1-20261002');
  const id=randomUUID(),original=randomUUID();
  const brief={type:'createBrief',id,title:'Synthetic preserved requirements',summary:'Real structured input is retained',couponCode:'TEST',couponUrl:'https://example.test/offer',affiliateRate:0,kinnsoRate:0,creatorRate:0,publish:true,requirements:['Original source needed'],deliverables:['One authored report']};
  const probe=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s';
   INSERT INTO public.missions(id,merchant_profile_id,title,summary,mission_type,requirements,deliverables) VALUES('${original}','${merchantId}','Synthetic original','Preservation probe','coupon_affiliate',ARRAY['Keep original'],ARRAY['Keep authored output']);
   ${block}
   DO $check$ BEGIN IF (SELECT requirements FROM public.missions WHERE id='${original}') IS DISTINCT FROM ARRAY['Keep original'] OR (SELECT deliverables FROM public.missions WHERE id='${original}') IS DISTINCT FROM ARRAY['Keep authored output'] THEN RAISE EXCEPTION 'existing_content_overwritten';END IF;END $check$;
   ALTER TABLE public.missions RENAME COLUMN requirements TO kinnso_fixture_requirements;
   ALTER TABLE public.missions RENAME COLUMN deliverables TO kinnso_fixture_deliverables;
   ${block}
   SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claims','${claims}',true) IS NOT NULL;
   SELECT public.apply_kinnso_merchant_command('${merchantId}','${randomUUID()}','${JSON.stringify(brief)}'::jsonb) IS NOT NULL;
   RESET ROLE;
   DO $check$ BEGIN IF (SELECT requirements FROM public.missions WHERE id='${id}') IS DISTINCT FROM ARRAY['Original source needed'] OR (SELECT deliverables FROM public.missions WHERE id='${id}') IS DISTINCT FROM ARRAY['One authored report'] THEN RAISE EXCEPTION 'new_content_not_persisted';END IF;END $check$;
   ALTER TABLE public.missions RENAME COLUMN requirements TO kinnso_fixture_new_requirements;
   ALTER TABLE public.missions ADD COLUMN requirements integer;
   DO $reject$ BEGIN BEGIN ${block} RAISE EXCEPTION 'incompatible_content_accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'merchant_content_prerequisite_incompatible' THEN RAISE;END IF;END;END $reject$;
   ROLLBACK;`;
  const run=spawnSync('docker',['exec','-i',process.env.KINNSO_TEST_DB_CONTAINER,'psql','--no-psqlrc','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:probe,encoding:'utf8',timeout:20000});assert.equal(run.status,0,run.stderr);
  assert.equal((await ok(admin.from('missions').select('id').in('id',[id,original]))).length,0,'transaction rollback preserves the original database');
 }finally{if(merchantId)await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));await f.cleanup();}
});
