import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpsPilotCommand, parsePilotParticipantCommand } from '../lib/contracts/pilot.ts';
const id='123e4567-e89b-12d3-a456-426614174000', other='123e4567-e89b-12d3-a456-426614174001';
const ops=[
{type:'createRun',id,name:'Run',dataClassification:'synthetic',candidateReleaseSha:'dev',environmentOrigin:'http://localhost:3000'},
{type:'configureRun',id,expectedRevision:1,participationNoticeVersion:'p1',privacyNoticeVersion:'p1',contentConsentVersion:'c1',coordinatorReference:'ops:coord',supportOwnerReference:'ops:support',privacyOwnerReference:'ops:privacy',alertOwnerReference:'ops:alerts',privateChannelReference:'channel:private',syntheticRehearsalRunId:null},
{type:'setRunStatus',id,expectedRevision:1,status:'recruiting',reason:'Approved'},
{type:'addParticipant',id,runId:id,role:'traveller',cohortRole:'required_traveller',displayLabel:'Traveller A'},
{type:'setParticipantStatus',id,expectedRevision:1,status:'active',reason:'Verified'},
{type:'createInvite',id,participantId:id,expiresInHours:168},
{type:'revokeInvite',id,participantId:id,reason:'Rotate'},
{type:'reviewContentIntake',id,expectedRevision:1,decision:'approve',reason:'Rights verified'},
{type:'bindGuide',intakeId:id,guideId:other,expectedRevision:1},
{type:'bindCollaboration',id,runId:id,merchantParticipantId:id,creatorParticipantId:other,missionId:id},
{type:'setManualCheck',id,expectedRevision:1,status:'pass',evidenceReference:'private:evidence',observedSummary:'Observed'},
{type:'addEvidenceReference',runId:id,checkCode:'check',entityType:'guide',entityId:id,evidenceReference:null}];
const intake={title:'Title',destination:'Place',authoredLocale:'en',sourceSummary:'Observed research',sourceUrls:['https://example.com/'],rightsBasis:'original',rightsEvidenceReference:'private:rights',authorConsentVersion:'v1',coverRightsConfirmed:null,coverRightsEvidenceReference:null};
const participant=[{type:'claimInvite',requestId:id,code:'a'.repeat(32)},{type:'acceptConsent',requestId:id,noticeVersion:'p1'},{type:'submitContentIntake',requestId:id,intake},{type:'updateOwnedContentIntake',requestId:id,id:other,expectedRevision:1,intake:{...intake,sourceUrls:[],rightsBasis:'permission',coverRightsConfirmed:true,coverRightsEvidenceReference:'private:cover'}},{type:'acknowledgeNotification',requestId:id},{type:'acknowledgeSupportResponse',requestId:id}];
test('accepts every operations command variant',()=>{for(const c of ops) assert.deepEqual(parseOpsPilotCommand(c),c)});
test('accepts every participant command variant',()=>{for(const c of participant) assert.deepEqual(parsePilotParticipantCommand(c),c)});
test('rejects unknown keys, commands, duplicate IDs and invalid UUIDs',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[0],extra:true}));assert.throws(()=>parseOpsPilotCommand({...ops[0],type:'invented'}));assert.throws(()=>parseOpsPilotCommand({...ops[9],creatorParticipantId:id}));assert.throws(()=>parseOpsPilotCommand({...ops[3],runId:'bad'}))});
test('bounds text and restricts content source URLs to HTTP(S)',()=>{assert.throws(()=>parseOpsPilotCommand({...ops[0],name:'x'.repeat(201)}));assert.throws(()=>parsePilotParticipantCommand({...participant[2],intake:{...intake,sourceSummary:'x'.repeat(4001)}}));for(const url of ['javascript:alert(1)','file:///tmp/a','ftp://example.com'])assert.throws(()=>parsePilotParticipantCommand({...participant[2],intake:{...intake,sourceUrls:[url]}}))});
test('requires real run release identity and secure origin',()=>{const real={...ops[0],dataClassification:'real',candidateReleaseSha:'A'.repeat(40),environmentOrigin:'http://example.com'};assert.throws(()=>parseOpsPilotCommand(real));assert.throws(()=>parseOpsPilotCommand({...real,candidateReleaseSha:'a'.repeat(40),environmentOrigin:'http://example.com'}));assert.equal(parseOpsPilotCommand({...real,candidateReleaseSha:'a'.repeat(40),environmentOrigin:'https://example.com'}).candidateReleaseSha,'a'.repeat(40))});
test('requires complete immutable real-run configuration before running',()=>{const config={...ops[1],syntheticRehearsalRunId:other};assert.throws(()=>parseOpsPilotCommand({...config,privacyNoticeVersion:''}));assert.throws(()=>parseOpsPilotCommand({...config,syntheticRehearsalRunId:'bad'}));assert.throws(()=>parseOpsPilotCommand({...config,alertOwnerReference:''}))});
test('validates invite duration and manual pass evidence',()=>{for(const hours of [0,169,1.5])assert.throws(()=>parseOpsPilotCommand({...ops[5],expiresInHours:hours}));assert.throws(()=>parseOpsPilotCommand({...ops[10],evidenceReference:null}));assert.throws(()=>parseOpsPilotCommand({...ops[10],observedSummary:null}))});
test('participant commands cannot carry operations identity or authority fields',()=>{for(const key of ['userId','runId','decision','approval','role','evidenceReference'])assert.throws(()=>parsePilotParticipantCommand({...participant[0],[key]:'forbidden'}))});
