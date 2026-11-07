import type { PilotExportBlocker } from '../pilot/blockers.ts';
import { object, uuid } from '../api/validation.ts';

export type PilotRole = 'traveller' | 'creator' | 'merchant';
export type PilotCohortRole = 'required_traveller' | 'required_creator' | 'required_merchant' | 'observer';
export type PilotRunStatus = 'draft' | 'recruiting' | 'paused' | 'running' | 'completed' | 'cancelled';
export type PilotCheckStatus = 'not_run' | 'pass' | 'fail' | 'blocked';
export type PilotEvidenceEntityType = 'guide' | 'trip' | 'mission' | 'mission_participant' | 'mission_submission' | 'notification' | 'support_case' | 'manual';
export type PilotReadinessStage = 'setup_incomplete' | 'ready_to_begin' | 'executing' | 'execution_complete' | 'completed' | 'blocked';
export type PilotContentIntakeInput = { title:string; destination:string; authoredLocale:string; sourceSummary:string; sourceUrls:string[]; rightsBasis:'original'|'licence'|'permission'; rightsEvidenceReference:string; authorConsentVersion:string;authorConsentDigest:string; coverRightsConfirmed:boolean|null; coverRightsEvidenceReference:string|null };
export type OpsPilotCommand =
 | {type:'createRun';id:string;name:string;dataClassification:'synthetic'|'real';candidateReleaseSha:string;environmentOrigin:string}
 | {type:'configureRun';id:string;expectedRevision:number;participationNoticeVersion:string;participationNoticeDigest:string;privacyNoticeVersion:string;privacyNoticeDigest:string;contentConsentVersion:string;contentConsentDigest:string;coordinatorReference:string;supportOwnerReference:string;privacyOwnerReference:string;alertOwnerReference:string;privateChannelReference:string;syntheticRehearsalRunId:string|null}
 | {type:'setRunStatus';id:string;expectedRevision:number;status:PilotRunStatus;reason:string}
 | {type:'addParticipant';id:string;runId:string;role:PilotRole;cohortRole:PilotCohortRole;displayLabel:string}
 | {type:'setParticipantStatus';id:string;expectedRevision:number;status:'active'|'paused'|'withdrawn'|'completed';reason:string}
 | {type:'createInvite';id:string;participantId:string;expectedRevision:number;expiresInHours:number}
 | {type:'revokeInvite';id:string;participantId:string;expectedRevision:number;reason:string}
 | ({type:'reviewContentIntake';id:string;expectedRevision:number;reason:string} & ({decision:'reject'}|{decision:'approve';expectedDraftRevision:number;expectedContentDigest:string}))
 | {type:'bindGuide';intakeId:string;guideId:string;expectedRevision:number}
 | {type:'bindCollaboration';id:string;runId:string;merchantParticipantId:string;creatorParticipantId:string;missionId:string}
 | {type:'setManualCheck';id:string;expectedRevision:number;status:PilotCheckStatus;evidenceReference:string|null;observedSummary:string|null}
 | {type:'addEvidenceReference';runId:string;checkCode:string;entityType:PilotEvidenceEntityType;entityId:string;participantId?:string|null;evidenceReference:string|null};
export type PilotParticipantCommand =
 | {type:'claimInvite';requestId:string;code:string}
 | {type:'acceptConsent';requestId:string;noticeVersion:string;noticeDigest:string;privacyNoticeVersion:string;privacyNoticeDigest:string}
 | {type:'submitContentIntake';requestId:string;intake:PilotContentIntakeInput}
 | {type:'updateOwnedContentIntake';requestId:string;id:string;expectedRevision:number;intake:PilotContentIntakeInput}
 | {type:'acknowledgeNotification';requestId:string}
 | {type:'acknowledgeSupportResponse';requestId:string};
export type OpsPilotSnapshot={run:OpsPilotRunView|null;participants:OpsPilotParticipantView[];contentIntakes:OpsPilotContentIntakeView[];collaboration:OpsPilotCollaborationView|null;checks:OpsPilotCheckView[];readiness:PilotReadinessView};
export type OpsPilotRunView={id:string;name:string;status:PilotRunStatus;revision:number;dataClassification:'synthetic'|'real';candidateReleaseSha:string;environmentOrigin:string;acceptanceStartedAt:string|null;minimumPublishedGuides:number;participationNoticeVersion:string|null;participationNoticeDigest?:string|null;privacyNoticeVersion:string|null;privacyNoticeDigest?:string|null;contentConsentVersion:string|null;contentConsentDigest?:string|null};
export type OpsPilotParticipantView={activeInvite?:{id:string;status:'active';expiresAt:string}|null;id:string;role:PilotRole;cohortRole:PilotCohortRole;displayLabel:string;status:'invited'|'joined'|'active'|'paused'|'withdrawn'|'completed';userLinked:boolean;consentAccepted:boolean;revision:number};
export type OpsPilotContentIntakeView={currentDraftRevision?:number|null;currentContentDigest?:string|null;id:string;creatorParticipantId:string;guideId:string|null;status:'draft'|'submitted'|'approved'|'rejected'|'published'|'withdrawn';guideDraftRevision:number|null;reviewedGuideVersion:number|null;contentDigest:string|null;title:string;destination:string;authoredLocale:string;revision:number};
export type OpsPilotCollaborationView={id:string;merchantParticipantId:string;creatorParticipantId:string;missionId:string|null;steps:Array<{code:string;status:PilotCheckStatus}>};
export type OpsPilotCheckView={id?:string;code:string;category:string;status:PilotCheckStatus;evidenceReference:string|null;observedSummary:string|null;revision:number;derived:boolean};
export type PilotReadinessView={stage:PilotReadinessStage;readyToBegin:boolean;executionComplete:boolean;blockers:Array<{code:string;category:string;messageKey:string;recordId?:string}>};
function noticeDigest(value:unknown):string { if(typeof value !== 'string' || value.length !== 64 || !/^[0-9a-f]{64}$/.test(value)) return fail(); return value; }
export type PilotSelfSnapshot={run:PilotSelfRunView|null;participant:PilotSelfParticipantView|null;nextStep:PilotParticipantNextStep|null;readiness:PilotReadinessView;
 contentConsent?:{version:string;digest:string}|null; intake?:PilotSelfIntake|null;
 workflowLinks?:{merchant:string|null;trip:string|null;supportCaseId:string|null}|null};
export type PilotSelfIntake=Omit<PilotContentIntakeInput,'authorConsentVersion'|'authorConsentDigest'> & {
 id:string;status:OpsPilotContentIntakeView['status'];revision:number;reviewReason:string|null;
 guideId:string|null;currentDraftRevision:number|null;editorHref:string|null;
};
export type PilotSelfRunView={id:string;name:string;status:PilotRunStatus;participationNoticeVersion?:string|null;participationNoticeDigest?:string|null;privacyNoticeVersion?:string|null;privacyNoticeDigest?:string|null};
export type PilotSelfParticipantView={id:string;role:PilotRole;status:'invited'|'joined'|'active'|'paused'|'withdrawn'|'completed';consentVersion:string|null;consentDigest?:string|null};
export type PilotParticipantNextStep={code:string;href:string|null;messageKey:string};
export type OpsPilotMutationResult={snapshot:OpsPilotSnapshot;inviteCode?:string};
export type PilotParticipantMutationResult={snapshot:PilotSelfSnapshot};
export type PilotMetricAction='pilot.run.created'|'pilot.run.configured'|'pilot.run.status_changed'|'pilot.invite.created'|'pilot.participant.joined'|'pilot.participant.status_changed'|'pilot.consent.accepted'|'pilot.content.submitted'|'pilot.content.reviewed'|'pilot.content.published'|'pilot.guide.bound'|'pilot.collaboration.bound'|'pilot.evidence.added'|'pilot.notification.acknowledged'|'pilot.support.acknowledged'|'pilot.check.changed';
export type PilotMetricIdentifiers={runId:string;participantId?:string;contentIntakeId?:string;checkCode?:string;status?:string};
export type PilotExportSummary={schemaVersion:1;exportedAt:string;run:{id:string;status:PilotRunStatus;dataClassification:'synthetic'|'real'}|null;readiness:Omit<PilotReadinessView,'blockers'>&{blockers:PilotExportBlocker[]};checks:Array<{code:string;status:PilotCheckStatus;derived:boolean;evidenceReference:string|null}>};
const fail=():never=>{throw new Error('INVALID')};
const str=(v:unknown,min=1,max=500):string=>typeof v==='string'&&v.trim().length>=min&&v.length<=max?v.trim():fail();
const rev=(v:unknown):number=>Number.isSafeInteger(v)&&Number(v)>0?Number(v):fail();
const choice=<T extends string>(v:unknown,values:readonly T[]):T=>typeof v==='string'&&values.includes(v as T)?v as T:fail();
const ident=(v:unknown):string=>uuid(v)?v:fail();
function intake(value:unknown):PilotContentIntakeInput {
 const x=object(value,['title','destination','authoredLocale','sourceSummary','sourceUrls','rightsBasis','rightsEvidenceReference','authorConsentVersion','authorConsentDigest','coverRightsConfirmed','coverRightsEvidenceReference']);
 if(!Array.isArray(x.sourceUrls)||x.sourceUrls.length>20) throw new Error('INVALID');
 const sourceUrls=(x.sourceUrls as unknown[]).map((entry:unknown)=>{const u=str(entry,1,2048);let parsed:URL;try{parsed=new URL(u)}catch{return fail()} if(!['http:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password)fail();return parsed.toString()});
 const cover=x.coverRightsConfirmed;
 if(cover!==null&&typeof cover!=='boolean')throw new Error('INVALID');
 const coverRef=x.coverRightsEvidenceReference===null?null:str(x.coverRightsEvidenceReference,1,500);
 if(cover===true&&!coverRef||cover===false&&coverRef)fail();
 return {title:str(x.title,1,160),destination:str(x.destination,1,160),authoredLocale:str(x.authoredLocale,2,20),sourceSummary:str(x.sourceSummary,1,4000),sourceUrls,rightsBasis:choice(x.rightsBasis,['original','licence','permission']),rightsEvidenceReference:str(x.rightsEvidenceReference,1,500),authorConsentVersion:str(x.authorConsentVersion,1,120),authorConsentDigest:noticeDigest(x.authorConsentDigest),coverRightsConfirmed:cover as boolean|null,coverRightsEvidenceReference:coverRef};
}
export function parseOpsPilotCommand(input:unknown):OpsPilotCommand {
 const type=(input&&typeof input==='object'&&!Array.isArray(input)?(input as Record<string,unknown>).type:undefined);
 const fields:Record<string,string[]>={createRun:['type','id','name','dataClassification','candidateReleaseSha','environmentOrigin'],configureRun:['type','id','expectedRevision','participationNoticeVersion','participationNoticeDigest','privacyNoticeVersion','privacyNoticeDigest','contentConsentVersion','contentConsentDigest','coordinatorReference','supportOwnerReference','privacyOwnerReference','alertOwnerReference','privateChannelReference','syntheticRehearsalRunId'],setRunStatus:['type','id','expectedRevision','status','reason'],addParticipant:['type','id','runId','role','cohortRole','displayLabel'],setParticipantStatus:['type','id','expectedRevision','status','reason'],createInvite:['type','id','participantId','expectedRevision','expiresInHours'],revokeInvite:['type','id','participantId','expectedRevision','reason'],reviewContentIntake:['type','id','expectedRevision','decision','reason'],bindGuide:['type','intakeId','guideId','expectedRevision'],bindCollaboration:['type','id','runId','merchantParticipantId','creatorParticipantId','missionId'],setManualCheck:['type','id','expectedRevision','status','evidenceReference','observedSummary'],addEvidenceReference:['type','runId','checkCode','entityType','entityId','participantId','evidenceReference']};
 if(typeof type!=='string'||!Object.hasOwn(fields,type))fail(); const approval=type==='reviewContentIntake' && (input as Record<string,unknown>).decision==='approve'; const o=object(input,approval?[...fields.reviewContentIntake,'expectedDraftRevision','expectedContentDigest']:fields[type as string]);
 switch(type){
 case'createRun': {const classification=choice(o.dataClassification,['synthetic','real']);const sha=str(o.candidateReleaseSha,1,80);const url=str(o.environmentOrigin,1,2048);let u:URL;try{u=new URL(url)}catch{return fail()}if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!['http:','https:'].includes(u.protocol))fail();if(classification==='real'&&(!/^[0-9a-f]{40}$/.test(sha)||u.protocol!=='https:'))fail();return{type,id:ident(o.id),name:str(o.name,1,200),dataClassification:classification,candidateReleaseSha:sha,environmentOrigin:u.origin}}
 case'configureRun': {const rehearsal=o.syntheticRehearsalRunId===null?null:ident(o.syntheticRehearsalRunId);return{type,id:ident(o.id),expectedRevision:rev(o.expectedRevision),participationNoticeVersion:str(o.participationNoticeVersion,1,120),participationNoticeDigest:noticeDigest(o.participationNoticeDigest),privacyNoticeVersion:str(o.privacyNoticeVersion,1,120),privacyNoticeDigest:noticeDigest(o.privacyNoticeDigest),contentConsentVersion:str(o.contentConsentVersion,1,120),contentConsentDigest:noticeDigest(o.contentConsentDigest),coordinatorReference:str(o.coordinatorReference,1,200),supportOwnerReference:str(o.supportOwnerReference,1,200),privacyOwnerReference:str(o.privacyOwnerReference,1,200),alertOwnerReference:str(o.alertOwnerReference,1,200),privateChannelReference:str(o.privateChannelReference,1,200),syntheticRehearsalRunId:rehearsal}}
 case'setRunStatus':return{type,id:ident(o.id),expectedRevision:rev(o.expectedRevision),status:choice(o.status,['draft','recruiting','paused','running','completed','cancelled']),reason:str(o.reason,1,1000)};
 case'addParticipant':return{type,id:ident(o.id),runId:ident(o.runId),role:choice(o.role,['traveller','creator','merchant']),cohortRole:choice(o.cohortRole,['required_traveller','required_creator','required_merchant','observer']),displayLabel:str(o.displayLabel,1,80)};
 case'setParticipantStatus':return{type,id:ident(o.id),expectedRevision:rev(o.expectedRevision),status:choice(o.status,['active','paused','withdrawn','completed']),reason:str(o.reason,1,1000)};
 case'createInvite':if(!Number.isInteger(o.expiresInHours)||Number(o.expiresInHours)<1||Number(o.expiresInHours)>168)fail();return{type,id:ident(o.id),participantId:ident(o.participantId),expectedRevision:rev(o.expectedRevision),expiresInHours:Number(o.expiresInHours)};
 case'revokeInvite':return{type,id:ident(o.id),participantId:ident(o.participantId),expectedRevision:rev(o.expectedRevision),reason:str(o.reason,1,1000)};
 case'reviewContentIntake': {
  const base={type,id:ident(o.id),expectedRevision:rev(o.expectedRevision),reason:str(o.reason,1,1000)} as const;
  if(o.decision==='reject')return {...base,decision:'reject'};
  const revision=rev(o.expectedDraftRevision);
  if(o.decision!=='approve'||revision>999999999||typeof o.expectedContentDigest!=='string'||!/^[a-f0-9]{64}$/.test(o.expectedContentDigest))return fail();
  return {...base,decision:'approve',expectedDraftRevision:revision,expectedContentDigest:o.expectedContentDigest};
 }
 case'bindGuide':return{type,intakeId:ident(o.intakeId),guideId:ident(o.guideId),expectedRevision:rev(o.expectedRevision)};
 case'bindCollaboration':{const m=ident(o.merchantParticipantId),c=ident(o.creatorParticipantId);if(m.toLowerCase()===c.toLowerCase())fail();return{type,id:ident(o.id),runId:ident(o.runId),merchantParticipantId:m,creatorParticipantId:c,missionId:ident(o.missionId)}}
 case'setManualCheck':{const status=choice(o.status,['not_run','pass','fail','blocked']);const evidence=o.evidenceReference===null?null:str(o.evidenceReference,1,500);const summary=o.observedSummary===null?null:str(o.observedSummary,1,1000);if(status==='pass'&&(!evidence||!summary))fail();return{type,id:ident(o.id),expectedRevision:rev(o.expectedRevision),status,evidenceReference:evidence,observedSummary:summary}}
 case'addEvidenceReference': {
  const runId=ident(o.runId), entityId=ident(o.entityId), checkCode=str(o.checkCode,1,100);
  const entityType=choice(o.entityType,['guide','trip','mission','mission_participant','mission_submission','notification','support_case','manual']);
  const participantId=o.participantId===undefined||o.participantId===null?null:ident(o.participantId);
  const evidenceReference=o.evidenceReference===null?null:str(o.evidenceReference,1,500);
  const scopedType=checkCode==='guide_discovered'?'guide':checkCode==='trip_recovered'?'trip':null;
  const external=['privacy_support','alert_owner','physical_ios','physical_android','voiceover','nvda'].includes(checkCode);
  if(scopedType && (!participantId||entityType!==scopedType||!evidenceReference))fail();
  if(!scopedType && participantId!==null)fail();
  if(external && (entityType!=='manual'||entityId.toLowerCase()!==runId.toLowerCase()||!evidenceReference))fail();
  if(entityType==='manual'&&!external)fail();
  return{type,runId,checkCode,entityType,entityId,...(o.participantId===undefined?{}:{participantId}),evidenceReference};
 }

 default:return fail();
 }
}
export function parsePilotParticipantCommand(input:unknown):PilotParticipantCommand {
 const type=input&&typeof input==='object'&&!Array.isArray(input)?(input as Record<string,unknown>).type:undefined;
 const fields:Record<string,string[]>={claimInvite:['type','requestId','code'],acceptConsent:['type','requestId','noticeVersion','noticeDigest','privacyNoticeVersion','privacyNoticeDigest'],submitContentIntake:['type','requestId','intake'],updateOwnedContentIntake:['type','requestId','id','expectedRevision','intake'],acknowledgeNotification:['type','requestId'],acknowledgeSupportResponse:['type','requestId']};
 if(typeof type!=='string'||!Object.hasOwn(fields,type))fail();const o=object(input,fields[type as string]);
 switch(type){case'claimInvite':return{type,requestId:ident(o.requestId),code:str(o.code,32,512)};case'acceptConsent':return{type,requestId:ident(o.requestId),noticeVersion:str(o.noticeVersion,1,120),noticeDigest:noticeDigest(o.noticeDigest),privacyNoticeVersion:str(o.privacyNoticeVersion,1,120),privacyNoticeDigest:noticeDigest(o.privacyNoticeDigest)};case'submitContentIntake':return{type,requestId:ident(o.requestId),intake:intake(o.intake)};case'updateOwnedContentIntake':return{type,requestId:ident(o.requestId),id:ident(o.id),expectedRevision:rev(o.expectedRevision),intake:intake(o.intake)};case'acknowledgeNotification':case'acknowledgeSupportResponse':return{type,requestId:ident(o.requestId)};default:return fail()}
}
