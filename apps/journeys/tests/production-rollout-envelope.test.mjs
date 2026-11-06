import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {freezeCandidate} from '../../../scripts/migration-release.mjs';

const envelopeUrl=new URL('../../../docs/implementation/PRODUCTION_DB_ENVELOPE_2026-11-07.json',import.meta.url);
const planUrl=new URL('../../../docs/superpowers/plans/2026-11-07-kinnso-production-rollout.md',import.meta.url);
const migrationsRoot=new URL('../../../supabase/migrations/',import.meta.url);
const envelope=JSON.parse(await readFile(envelopeUrl,'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');

test('production envelope freezes exactly five reviewed migration files',async()=>{
 assert.equal(envelope.status,'DEPLOYED_AND_VERIFIED_WITH_INTERACTIVE_BROWSER_RERUN_BLOCKED');
 assert.equal(envelope.productionChanged,true);
 assert.equal(envelope.approval.status,'APPROVED_AND_EXECUTED');
 assert.equal(envelope.executionResult.database.migrationCount,209);
 assert.equal(envelope.executionResult.database.migrationHead,'20261107020000');
 assert.equal(envelope.executionResult.promotion.status,'PASS');
 assert.equal(envelope.executionResult.authenticatedBackendAttestation.interactiveEdgeRerun.status,'BLOCKED');
 assert.equal(envelope.approval.requiredHumanReply,'approve');
 assert.equal(envelope.migrationCandidate.fileCount,5);
 assert.equal(envelope.migrationCandidate.files.length,5);
 const entries=[];for(const [index,file] of envelope.migrationCandidate.files.entries()){
  assert.equal(file.order,index+1);
  const bytes=await readFile(new URL(file.name,migrationsRoot));
  assert.equal(sha(bytes),file.sha256,file.name);
  entries.push({name:file.name,bytes});
 }
 const manifest={files:entries.map(entry=>({name:entry.name,sha256:sha(entry.bytes)})),sha256:envelope.migrationCandidate.envelopeSha256};
 const frozen=freezeCandidate(entries,manifest);
 assert.equal(frozen.files,5);assert.equal(frozen.sha256,envelope.migrationCandidate.envelopeSha256);
});

test('production envelope preserves divergent ledger entries and exact postconditions',()=>{
 assert.deepEqual(envelope.baseline.preserveProductionOnlyMigrations.map(value=>value.version),['20261025140000','20261105123750']);
 assert.equal(envelope.baseline.migrationHead,'20261105123750');
 assert.equal(envelope.expectedPostState.migrationCount,209);
 assert.equal(envelope.expectedPostState.migrationHead,'20261107020000');
 assert.equal(envelope.expectedPostState.authenticatedAuditAppendAllowed,false);
 assert.equal(envelope.expectedPostState.contentMutationRpcsPresent,6);
 assert.deepEqual(envelope.expectedPostState.operationsReadPoliciesPresent.sort(),['community_sessions_ops_read','partner_perks_ops_read','testimonials_ops_read']);
 assert.equal(envelope.execution.retryPolicy,'NO_AUTOMATIC_RETRY');
 assert.equal(envelope.execution.applicationBeforeDatabaseAllowed,false);
 assert.equal(envelope.deployment.currentProductionDeployment.rollbackTarget,true);
 assert.equal(envelope.backupRestore,'WAIVED');
});

test('production rollout plan names the exact files, deployment and rollback scope',async()=>{
 const plan=await readFile(planUrl,'utf8');
 for(const file of envelope.migrationCandidate.files)assert.match(plan,new RegExp(file.name.replaceAll('.','\\.')));
 assert.match(plan,/vercel deploy --prod --skip-domain/);
 assert.match(plan,/vercel promote \$STAGED_DEPLOYMENT_ID --yes/);
 assert.match(plan,/dpl_8fVAPaBpULzeF4WCg8s2CHQ2V2Cs/);
 assert.match(plan,/33897aba413aaf1a6344176ff6a8e4f56316d7f441cdb6feb89a1fa001cbdb40/);
 assert.match(plan,/Approval does not authorize paid providers/i);
});
