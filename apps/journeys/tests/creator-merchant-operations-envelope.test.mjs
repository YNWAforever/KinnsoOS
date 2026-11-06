import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const envelope=JSON.parse(await readFile(new URL('../../../docs/creator-merchant-operations-release-2026-11-06.json',import.meta.url),'utf8'));
const matrix=JSON.parse(await readFile(new URL('../../../docs/legacy-route-matrix.json',import.meta.url),'utf8'));

test('combined creator-merchant-operations envelope binds the final application and clean database evidence',()=>{
 assert.equal(envelope.status,'DEPLOYED_VERIFIED_PUBLIC_LAUNCH_HOLD');assert.equal(envelope.launchRecommendation,'HOLD');assert.equal(envelope.deploymentReady,true);
 assert.equal(envelope.applicationSourceHead,envelope.releaseCommits.finalApplication);
 assert.match(envelope.applicationSourceHead,/^[a-f0-9]{40}$/);
 assert.match(envelope.sourceArchive.sha256,/^[a-f0-9]{64}$/);assert.equal(envelope.sourceArchive.metadataRevision,envelope.applicationSourceHead);assert.equal(envelope.sourceArchive.dirty,false);
 assert.equal(envelope.database.cleanChainReset,true);assert.ok(Number.isInteger(envelope.database.migrationCount));assert.ok(envelope.database.migrationCount>=203);assert.match(envelope.database.lastMigration,/^\d{14}$/);
 for(const key of ['authUsers','creators','merchantProfiles','opsMembers','opsAudit','guides','experiences','sessions','merchantOffers','partnerPerks','analyticsEvents'])assert.ok(Number.isInteger(envelope.database.retainedSyntheticRecords[key])&&envelope.database.retainedSyntheticRecords[key]>=0,key);
 assert.ok(envelope.tests.journeysUnit.passed>=1482);assert.equal(envelope.tests.journeysUnit.failed,0);assert.equal(envelope.tests.typecheck,'PASS');assert.equal(envelope.tests.productionModeWebpackBuild,'PASS');
 assert.ok(envelope.tests.connectedBrowser.finalHardenedRegressionPassed>=14);
 assert.ok(envelope.tests.operationsSecurity.isolatedIntegrationPassed>=3);
 assert.ok(envelope.tests.operationalApis.contractAndUnitPassed>=9);
 assert.ok(envelope.tests.operationalApis.connectedSafeModePassed>=1);
 assert.ok(envelope.tests.operationalApis.connectedAnalyticsPersistencePassed>=1);
 assert.ok(envelope.tests.operationsModeration.connectedPassed>=1);
 assert.equal(envelope.tests.productionRollout.status,'DEPLOYED_VERIFIED');
 assert.equal(envelope.tests.productionRollout.currentDeployment,'dpl_BZDa82gXNB7KGJeZzjvhBSTB6TtP');
 assert.equal(envelope.tests.productionRollout.currentDatabaseLedgerHead,'20261107020000');
 assert.equal(envelope.tests.productionRollout.runtimeHealthEndpointOnCurrentProduction,200);
 assert.equal(envelope.tests.productionRollout.interactiveBrowserRerun,'BLOCKED_COMPUTER_USE_KERNEL_ASSETS');
 assert.equal(envelope.productionChanged,true);assert.equal(envelope.journeysDeploymentChanged,false);assert.equal(envelope.backupRestore,'WAIVED');
 assert.ok(envelope.remainingLaunchGates.length>0);assert.ok(envelope.gated.length>0);
});

test('route matrix counts agree with the release envelope and accepted rows have native destinations',()=>{
 const counts={};for(const row of matrix.routes)counts[row.disposition]=(counts[row.disposition]??0)+1;
 assert.equal(matrix.routes.length,envelope.routeMatrix.total);
 assert.equal(counts['native-port-accepted'],envelope.routeMatrix.nativePortAccepted);
 assert.equal(counts['native-port-local'],envelope.routeMatrix.nativePortLocal);
 assert.equal(counts['excluded-gated'],envelope.routeMatrix.excludedGated);
 assert.equal(counts['native-equivalent-candidate']??0,envelope.routeMatrix.nativeEquivalentCandidate);
 assert.equal(counts['identifier-resolution'],envelope.routeMatrix.identifierResolution);
 assert.equal(counts.operational??0,envelope.routeMatrix.operational);
 assert.equal(counts['port-required']??0,envelope.routeMatrix.portRequired);
 assert.equal(envelope.routeMatrix.nativePortAccepted+envelope.routeMatrix.nativePortLocal+envelope.routeMatrix.excludedGated+envelope.routeMatrix.nativeEquivalentCandidate+envelope.routeMatrix.identifierResolution+envelope.routeMatrix.operational+envelope.routeMatrix.portRequired,envelope.routeMatrix.total);
 assert.equal(envelope.routeMatrix.nativeEquivalentCandidate,0);
 assert.equal(envelope.routeMatrix.operational,0);
 assert.equal(envelope.routeMatrix.portRequired,0);
 for(const path of ['/{locale}/about','/{locale}/contact','/{locale}/creators','/{locale}/explore','/{locale}/for-creators','/{locale}/legal/creator-terms','/{locale}/merchants'])assert.equal(matrix.routes.find(row=>row.legacyPath===path)?.disposition,'native-port-accepted',path);
 for(const path of ['/{locale}/feed','/{locale}/for-merchants','/{locale}/auth/reset-password','/{locale}/auth/sign-out'])assert.equal(matrix.routes.find(row=>row.legacyPath===path)?.disposition,'native-port-accepted',path);
 for(const path of ['/{locale}/experiences/[slug]/booked','/{locale}/offers/[claimId]','/page.tsx'])assert.equal(matrix.routes.find(row=>row.legacyPath===path)?.disposition,'excluded-gated',path);
 for(const path of ['/api/admin/analytics','/api/analytics','/api/cron/traveller-analytics-retention','/api/health','/api/revalidate'])assert.equal(matrix.routes.find(row=>row.legacyPath===path)?.disposition,'native-port-accepted',path);
 for(const row of matrix.routes.filter(row=>row.disposition==='native-port-accepted'))assert.ok(row.nativePath&&(/^\/\{locale\}\//.test(row.nativePath)||row.nativePath.startsWith('/api/')),row.legacyPath);
 assert.equal(matrix.candidate.applicationSourceHead,envelope.applicationSourceHead);
 assert.equal(matrix.candidate.sourceArchiveSha256,envelope.sourceArchive.sha256);
});
