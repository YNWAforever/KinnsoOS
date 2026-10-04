import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fixture,admin} from './local-fixtures.mjs';
const ok=async promise=>{const r=await promise;assert.equal(r.error,null,JSON.stringify(r.error));return r.data;};

async function redemptionFixture(){
 const f=await fixture();let merchantId,offerId;
 try{
  const owner=await f.actor(),creator=await f.actor(true),visitor=await f.actor();
  merchantId=randomUUID();offerId=randomUUID();
  await ok(admin.from('merchant_profiles').insert({id:merchantId,user_id:owner.id,company_name:'Synthetic historical redemption',contact_email:'synthetic@example.test'}));
  await ok(admin.from('merchant_offers').insert({id:offerId,merchant_profile_id:merchantId,title:'Synthetic compatibility offer',terms:'Isolated verification only',discount_kind:'item',discount_value:1,commission_kind:'flat',commission_value:1,status:'live',valid_from:new Date(Date.now()-3600000).toISOString(),valid_to:new Date(Date.now()+86400000).toISOString()}));
  const claimId=randomUUID(),raw=randomUUID(),journey=randomUUID();
  await ok(admin.from('offer_claims').insert({id:claimId,offer_id:offerId,creator_id:creator.id,visitor_user_id:visitor.id,claim_token_hash:createHash('sha256').update(raw).digest('hex'),source_surface:'profile',status:'active',expires_at:new Date(Date.now()+3600000).toISOString()}));
  const session=await owner.client.auth.getSession();assert.equal(session.error,null);
  const jwt=JSON.parse(Buffer.from(session.data.session.access_token.split('.')[1],'base64url').toString());
  assert.equal(jwt.sub,owner.id);assert.match(jwt.session_id,/^[0-9a-f-]{36}$/i);
  const claims=JSON.stringify({sub:owner.id,session_id:jwt.session_id,is_anonymous:false,role:'authenticated'});
  return {owner,merchantId,offerId,claimId,raw,journey,claims,cleanup:async()=>{await ok(admin.from('offer_redemptions').delete().eq('merchant_profile_id',merchantId));await ok(admin.from('offer_claims').delete().eq('id',claimId));await ok(admin.from('merchant_profiles').delete().eq('id',merchantId));await f.cleanup();}};
 }catch(error){if(merchantId)await admin.from('merchant_profiles').delete().eq('id',merchantId);await f.cleanup();throw error;}
}

function probe(f,setup,operation,assertions){
 // Guarded local fixtures supply every UUID; schema changes and all redemption
 // effects are confined to a transaction that always rolls back on disconnect.
 for(const id of [f.merchantId,f.offerId,f.claimId,f.raw,f.journey])assert.match(id,/^[0-9a-f-]{36}$/i);
 const inspect=spawnSync('docker',['inspect',process.env.KINNSO_TEST_DB_CONTAINER],{encoding:'utf8'});
 assert.equal(inspect.status,0,inspect.stderr);const target=JSON.parse(inspect.stdout)[0];
 assert.equal(target.Config.Labels['com.supabase.cli.project'],'kinnsoos-b1-20261002');assert.equal(target.State.Running,true);
 const sql=`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s';
 ${setup}
 SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','${f.claims}',true) IS NOT NULL;
 ${operation}
 RESET ROLE;
 DO $verify$ BEGIN ${assertions} END $verify$;
 ROLLBACK;`;
 const run=spawnSync('docker',['exec','-i',process.env.KINNSO_TEST_DB_CONTAINER,'psql','--no-psqlrc','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:20000});
 assert.equal(run.status,0,run.stderr);
}

test('legacy claims redeem and replay without installing analytics columns or a collector',async()=>{
 const f=await redemptionFixture();try{
  probe(f,`ALTER TABLE public.offer_claims RENAME COLUMN analytics_journey_id TO kinnso_fixture_journey;
   ALTER TABLE public.offer_claims RENAME COLUMN analytics_locale TO kinnso_fixture_locale;
   ALTER TABLE public.traveller_analytics_events RENAME TO kinnso_fixture_analytics;`,
   `DO $redeem$ DECLARE first jsonb; replay jsonb; BEGIN
    first:=public.redeem_offer_claim('${f.raw}',null); replay:=public.redeem_offer_claim('${f.raw}',null);
    IF first->>'redemption_id' IS NULL OR first->>'redemption_id'<>replay->>'redemption_id' OR replay->>'already_redeemed'<>'true' THEN RAISE EXCEPTION 'legacy_redemption_or_replay_failed'; END IF;
   END $redeem$;`,
   `IF (SELECT status FROM public.offer_claims WHERE id='${f.claimId}')<>'redeemed' OR (SELECT redeemed_count FROM public.merchant_offers WHERE id='${f.offerId}')<>1 OR (SELECT count(*) FROM public.offer_redemptions WHERE offer_claim_id='${f.claimId}')<>1 THEN RAISE EXCEPTION 'legacy_redemption_not_atomic'; END IF;
    IF EXISTS(SELECT 1 FROM public.kinnso_fixture_analytics WHERE journey_id='${f.journey}') THEN RAISE EXCEPTION 'legacy_consent_invented'; END IF;`);
  assert.equal((await ok(admin.from('offer_claims').select('status').eq('id',f.claimId).single())).status,'active','probe rollback preserves the original claim');
 }finally{await f.cleanup();}
});

test('consented redemption emits one existing collector event across replay',async()=>{
 const f=await redemptionFixture();try{
  await ok(admin.from('offer_claims').update({analytics_journey_id:f.journey,analytics_locale:'en'}).eq('id',f.claimId));
  probe(f,'',`DO $redeem$ BEGIN PERFORM public.redeem_offer_claim('${f.raw}',null); PERFORM public.redeem_offer_claim('${f.raw}',null); END $redeem$;`,
   `IF (SELECT count(*) FROM public.traveller_analytics_events WHERE journey_id='${f.journey}' AND event_name='offer_redeemed' AND entity_id='${f.offerId}')<>1 THEN RAISE EXCEPTION 'consented_redemption_not_exactly_once'; END IF;`);
 }finally{await f.cleanup();}
});

test('consent metadata with an absent collector fails before saving any redemption',async()=>{
 const f=await redemptionFixture();try{
  await ok(admin.from('offer_claims').update({analytics_journey_id:f.journey,analytics_locale:'en'}).eq('id',f.claimId));
  probe(f,'ALTER TABLE public.traveller_analytics_events RENAME TO kinnso_fixture_analytics;',
   `DO $redeem$ BEGIN
    BEGIN PERFORM public.redeem_offer_claim('${f.raw}',null); RAISE EXCEPTION 'collector_failure_was_not_rejected';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'analytics_contract_unavailable' THEN RAISE; END IF; END;
   END $redeem$;`,
   `IF (SELECT status FROM public.offer_claims WHERE id='${f.claimId}')<>'active' OR (SELECT redeemed_count FROM public.merchant_offers WHERE id='${f.offerId}')<>0 OR EXISTS(SELECT 1 FROM public.offer_redemptions WHERE offer_claim_id='${f.claimId}') THEN RAISE EXCEPTION 'collector_failure_wrote_redemption'; END IF;`);
 }finally{await f.cleanup();}
});
