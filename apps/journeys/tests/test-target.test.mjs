import test from 'node:test';import assert from 'node:assert/strict';import {verifyTestTarget} from '../scripts/verify-test-target.mjs';
import {runtimeFixture} from './helpers/target-runtime.mjs';
test('configured test label cannot authorize a different actual database URL',()=>{const env={KINNSO_TEST_TARGET:'local',KINNSO_TEST_PROJECT:'kinnsoos-b1-20261002',KINNSO_TEST_API_ORIGIN:'http://127.0.0.1:58421',KINNSO_TEST_DB_CONTAINER:'supabase_db_kinnsoos-b1-20261002',SUPABASE_URL:'https://unknown.supabase.co'};assert.throws(()=>verifyTestTarget(env));assert.equal(verifyTestTarget({...env,SUPABASE_URL:env.KINNSO_TEST_API_ORIGIN},runtimeFixture(env.KINNSO_TEST_PROJECT).run).environment,'local')});

test('the named pilot target is accepted only with its exact container and original loopback binding',()=>{
 const env={KINNSO_TEST_TARGET:'local',KINNSO_TEST_PROJECT:'kinnsoos-pilot-20261013',KINNSO_TEST_API_ORIGIN:'http://127.0.0.1:58421',KINNSO_TEST_DB_CONTAINER:'supabase_db_kinnsoos-pilot-20261013',SUPABASE_URL:'http://127.0.0.1:58421'};
 assert.equal(verifyTestTarget(env,runtimeFixture().run).projectRef,env.KINNSO_TEST_PROJECT);
 for(const change of [{KINNSO_TEST_DB_CONTAINER:'supabase_db_kinnsoos-b1-20261002'},{KINNSO_TEST_TARGET:'hosted'},{SUPABASE_URL:'https://production.supabase.co'},{KINNSO_SUPABASE_URL:'https://production.supabase.co'},{KINNSO_TEST_API_ORIGIN:'http://127.0.0.1:58422'},{KINNSO_TEST_PROJECT:'unrelated-local-project'}])assert.throws(()=>verifyTestTarget({...env,...change}));
});
