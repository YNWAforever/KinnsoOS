import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const envelope=JSON.parse(await readFile(new URL('../../../docs/creator-merchant-operations-release-2026-11-06.json',import.meta.url),'utf8'));
const matrix=JSON.parse(await readFile(new URL('../../../docs/legacy-route-matrix.json',import.meta.url),'utf8'));

test('combined creator-merchant-operations envelope binds the final application and clean database evidence',()=>{
 assert.equal(envelope.status,'READY_FOR_USER_REVIEW');assert.equal(envelope.launchRecommendation,'HOLD');
 assert.equal(envelope.applicationSourceHead,envelope.releaseCommits.finalAliasFix);
 assert.match(envelope.applicationSourceHead,/^[a-f0-9]{40}$/);
 assert.match(envelope.sourceArchive.sha256,/^[a-f0-9]{64}$/);assert.equal(envelope.sourceArchive.metadataRevision,envelope.applicationSourceHead);assert.equal(envelope.sourceArchive.dirty,false);
 assert.equal(envelope.database.cleanChainReset,true);assert.equal(envelope.database.migrationCount,201);assert.equal(envelope.database.lastMigration,'20261106110000');
 assert.ok(Object.values(envelope.database.fixturesAfterCleanup).every(value=>value===0));
 assert.equal(envelope.tests.journeysUnit.failed,0);assert.equal(envelope.tests.typecheck,'PASS');assert.equal(envelope.tests.productionModeWebpackBuild,'PASS');
 assert.equal(envelope.productionChanged,false);assert.equal(envelope.journeysDeploymentChanged,false);assert.equal(envelope.backupRestore,'WAIVED');
 assert.ok(envelope.remainingLaunchGates.length>0);assert.ok(envelope.gated.length>0);
});

test('route matrix counts agree with the release envelope and accepted rows have native destinations',()=>{
 const counts={};for(const row of matrix.routes)counts[row.disposition]=(counts[row.disposition]??0)+1;
 assert.equal(matrix.routes.length,envelope.routeMatrix.total);
 assert.equal(counts['native-port-accepted'],envelope.routeMatrix.nativePortAccepted);
 assert.equal(counts['native-port-local'],envelope.routeMatrix.nativePortLocal);
 assert.equal(counts['excluded-gated'],envelope.routeMatrix.excludedGated);
 assert.equal(counts['native-equivalent-candidate'],envelope.routeMatrix.nativeEquivalentCandidate);
 assert.equal(counts['identifier-resolution'],envelope.routeMatrix.identifierResolution);
 assert.equal(counts.operational,envelope.routeMatrix.operational);
 assert.equal(counts['port-required'],envelope.routeMatrix.portRequired);
 for(const row of matrix.routes.filter(row=>row.disposition==='native-port-accepted'))assert.ok(row.nativePath&&row.nativePath.startsWith('/{locale}/'),row.legacyPath);
 assert.equal(matrix.candidate.applicationSourceHead,envelope.applicationSourceHead);
 assert.equal(matrix.candidate.sourceArchiveSha256,envelope.sourceArchive.sha256);
});
