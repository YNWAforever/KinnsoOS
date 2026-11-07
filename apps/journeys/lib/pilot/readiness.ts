import type {
  OpsPilotContentIntakeView,
  OpsPilotRunView,
  OpsPilotSnapshot,
  PilotCheckStatus,
  PilotExportSummary,
  PilotReadinessView,
  PilotRunStatus,
} from '../contracts/pilot.ts';

export type PilotBeginReadinessInput = {
  run: OpsPilotRunView;
  capabilityConnected: boolean;
  ownersConfigured: boolean;
  noticesPinned: boolean;
  syntheticRehearsalPassed: boolean;
};

/** Internal RPC facts, separate from the display snapshot and acceptance export. */
export type PilotEvidenceFact = {
  runId: string;
  dataClassification: OpsPilotRunView['dataClassification'];
  capturedAt: string;
  entityId: string;
};

export type PilotExecutionFacts = {
  participants: Array<PilotEvidenceFact & { userId: string }>;
  publications: Array<PilotEvidenceFact & {
    intakeId: string;
    creatorUserId: string;
    status: string;
    publishedVersion: number | null;
    publishedContentDigest: string | null;
  }>;
  checks: Array<PilotEvidenceFact & {
    code: string;
    status: PilotCheckStatus;
    missionId?: string;
    /** Required for notification_acknowledged; the exact notification row acknowledged. */
    notificationId?: string;
  }>;
  /** Source submission history for the bound creator and mission. */
  submissions: Array<PilotEvidenceFact & { missionId: string; creatorUserId: string; status: string }>;
  notifications: Array<PilotEvidenceFact & {
    missionId: string;
    submissionId: string;
    creatorUserId: string;
    entityType: string;
    notificationType: string;
  }>;
};

export type PilotExecutionReadinessInput = Omit<OpsPilotSnapshot, 'readiness'> & { facts: PilotExecutionFacts };

export type PilotPublishEligibilityInput = {
  pilotLinked: boolean;
  runStatus: PilotRunStatus;
  intakeStatus: OpsPilotContentIntakeView['status'] | null;
  approvedDraftRevision: number | null;
  approvedContentDigest: string | null;
  currentDraftRevision: number | null;
  currentContentDigest: string | null;
  publishedVersion: number | null;
  creatorIsActive: boolean;
  guideIsWithdrawn: boolean;
};

export type PilotPublishBlockReason =
  | 'run_not_running'
  | 'intake_not_approved'
  | 'revision_changed'
  | 'digest_changed'
  | 'creator_inactive'
  | 'guide_withdrawn';

type Blockers = PilotReadinessView['blockers'];

function block(blockers: Blockers, category: string, code: string, recordId?: string) {
  // Locale-neutral key shared by the English and Traditional Chinese catalogs.
  blockers.push({ code, category, messageKey: 'pilot.readiness.' + code, ...(recordId ? { recordId } : {}) });
}

const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function validOrigin(value: string, real: boolean): boolean {
  if (!present(value)) return false;
  try {
    const url = new URL(value);
    return value === url.origin && (url.protocol === 'https:' || (!real && url.protocol === 'http:'));
  } catch {
    return false;
  }
}

export function pilotBeginReadiness(input: PilotBeginReadinessInput): PilotReadinessView {
  const { run } = input;
  const blockers: Blockers = [];
  const real = run.dataClassification === 'real';
  const add = (code: string) => block(blockers, 'setup', code, run.id);
  if (!real && run.dataClassification !== 'synthetic') add('classification_unknown');
  if (!validOrigin(run.environmentOrigin, real)) add('source_missing');
  if (!present(run.candidateReleaseSha) || (real && !/^[0-9a-f]{40}$/.test(run.candidateReleaseSha))) add('release_missing');
  if (input.capabilityConnected !== true) add('capability_disconnected');
  if (input.ownersConfigured !== true) add('owners_missing');
  if (input.noticesPinned !== true || ![
    run.participationNoticeVersion, run.privacyNoticeVersion, run.contentConsentVersion,
  ].every(present)) add('notices_unpinned');
  // Synthetic rehearsals bootstrap this gate; real runs require the persisted verdict.
  if (real && input.syntheticRehearsalPassed !== true) add('rehearsal_missing');
  const canBegin = run.status === 'draft' || run.status === 'recruiting';
  if (!canBegin) add('run_not_beginable');
  const readyToBegin = blockers.length === 0;
  return {
    stage: readyToBegin ? 'ready_to_begin' : canBegin ? 'setup_incomplete' : 'blocked',
    readyToBegin, executionComplete: false, blockers,
  };
}

const roles = ['traveller', 'creator', 'merchant'] as const;
const collaborationSteps = [
  'merchant_approved', 'mission_published', 'application_active',
] as const;
const travellerChecks = [
  'guide_discovered', 'guide_saved', 'trip_adopted', 'trip_revised', 'trip_recovered',
  'support_resolved', 'support_acknowledged',
] as const;
const manualChecks = [
  'guide_discovered', 'trip_recovered', 'privacy_support', 'alert_owner',
  'physical_ios', 'physical_android', 'voiceover', 'nvda',
] as const;

function uniquePass<T extends { code: string; status: string }>(records: T[], code: string): T | undefined {
  const matches = records.filter(record => record.code === code);
  return matches.length === 1 && matches[0]?.status === 'pass' ? matches[0] : undefined;
}

export function pilotExecutionReadiness(input: PilotExecutionReadinessInput): PilotReadinessView {
  const { run, participants, contentIntakes, collaboration, checks, facts } = input;
  const blockers: Blockers = [];
  if (!run) {
    block(blockers, 'setup', 'run_missing');
    return { stage: 'setup_incomplete', readyToBegin: false, executionComplete: false, blockers };
  }

  const assessable = run.status === 'running' || run.status === 'completed';
  if (!assessable) block(blockers, 'execution', 'run_not_running', run.id);
  if (run.dataClassification !== 'real' && run.dataClassification !== 'synthetic') {
    block(blockers, 'setup', 'classification_unknown', run.id);
  }
  if (!present(run.acceptanceStartedAt) || !Number.isFinite(Date.parse(run.acceptanceStartedAt))) {
    block(blockers, 'execution', 'acceptance_start_missing', run.id);
  }
  const slots = roles.map(role => {
    const matches = participants.filter(p => p.cohortRole === 'required_' + role);
    const participant = matches.length === 1 ? matches[0] : undefined;
    if (!participant || participant.role !== role || !present(participant.id)) {
      block(blockers, 'cohort', 'required_' + role + '_missing');
      return undefined;
    }
    if (participant.status !== 'active' || participant.userLinked !== true || participant.consentAccepted !== true) {
      block(blockers, 'cohort', 'required_' + role + '_not_ready', participant.id);
    }
    return participant.id;
  });
  const [, creatorId, merchantId] = slots;

  const eligible = (fact: PilotEvidenceFact) =>
    fact.runId === run.id && fact.dataClassification === run.dataClassification &&
    present(fact.entityId) && afterAcceptanceStart(fact.capturedAt, run.acceptanceStartedAt);

  function checkFactPasses(code: string, missionId?: string): boolean {
    const fact = uniquePass(facts?.checks ?? [], code);
    return !!fact && eligible(fact) && (missionId === undefined || fact.missionId === missionId);
  }

  function requireCheck(category: string, code: string) {
    const check = uniquePass(checks, code);
    const manual = manualChecks.some(required => required === code);
    if (!check || !checkFactPasses(code) || check.derived !== !manual ||
        (manual && (!present(check.evidenceReference) || !present(check.observedSummary)))) {
      block(blockers, category, code);
    }
  }

  const userIds = slots.map(slot => {
    if (!slot) return undefined;
    const matches = (facts?.participants ?? []).filter(fact => fact.entityId === slot);
    const fact = matches.length === 1 ? matches[0] : undefined;
    return fact && eligible(fact) && present(fact.userId) ? fact.userId : undefined;
  });
  const [, creatorUserId] = userIds;
  if (!userIds.every(present) ||
      new Set(userIds.map(userId => userId?.toLowerCase())).size !== roles.length ||
      new Set(slots).size !== roles.length) {
    block(blockers, 'cohort', 'distinct_auth_users');
  }
  requireCheck('content', 'creator_public');

  const validGuides = new Set<string>();
  const linkedGuideCounts = new Map<string, number>();
  for (const intake of [...contentIntakes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (present(intake.guideId)) {
      linkedGuideCounts.set(intake.guideId, (linkedGuideCounts.get(intake.guideId) ?? 0) + 1);
    }
    const publications = (facts?.publications ?? []).filter(fact => fact.intakeId === intake.id);
    const publication = publications.length === 1 ? publications[0] : undefined;
    const exactPublication = publication && eligible(publication) && !!creatorUserId &&
      publication.entityId === intake.guideId && publication.creatorUserId === creatorUserId &&
      publication.status === 'published' && publication.publishedVersion === intake.reviewedGuideVersion &&
      publication.publishedContentDigest === intake.contentDigest;
    const exact = exactPublication && !!creatorId && intake.creatorParticipantId === creatorId && present(intake.guideId) &&
      intake.status === 'published' && positiveInteger(intake.guideDraftRevision) &&
      intake.reviewedGuideVersion === intake.guideDraftRevision && present(intake.contentDigest);
    if (exact && intake.guideId) validGuides.add(intake.guideId);
    else if (present(intake.guideId) || intake.status === 'approved' || intake.status === 'published' || intake.status === 'withdrawn') {
      block(blockers, 'content', 'guide_not_exact', intake.id);
    }
  }
  if ([...linkedGuideCounts.values()].some(count => count > 1)) block(blockers, 'content', 'guide_binding_duplicate');
  if (!positiveInteger(run.minimumPublishedGuides) ||
      validGuides.size < Math.max(run.dataClassification === 'real' ? 3 : 1, run.minimumPublishedGuides)) {
    block(blockers, 'content', 'published_guides_missing');
  }

  if (!collaboration || !present(collaboration.missionId) || !creatorId || !merchantId ||
      collaboration.creatorParticipantId !== creatorId || collaboration.merchantParticipantId !== merchantId) {
    block(blockers, 'collaboration', 'mission_binding_missing', collaboration?.id);
  } else {
    for (const code of collaborationSteps) {
      if (!uniquePass(collaboration.steps, code) || !checkFactPasses(code, collaboration.missionId)) {
        block(blockers, 'collaboration', code, collaboration.id);
      }
    }
    const submissions = (facts?.submissions ?? [])
      .filter(fact => fact.missionId === collaboration.missionId && !!creatorUserId && fact.creatorUserId === creatorUserId);
    // Pick the latest source event; a tie cannot prove which status is final.
    const ordered = [...submissions].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
    const [latest, previous] = ordered;
    const approved = latest && submissions.every(eligible) && latest.status === 'approved' &&
      (!previous || Date.parse(latest.capturedAt) > Date.parse(previous.capturedAt));
    if (!approved) block(blockers, 'collaboration', 'submission_approved', collaboration.id);
    const notifications = approved ? (facts?.notifications ?? []).filter(fact =>
      eligible(fact) && fact.missionId === collaboration.missionId && fact.submissionId === latest.entityId &&
      fact.creatorUserId === creatorUserId && fact.entityType === 'mission' &&
      fact.notificationType === 'submission.approved' && Date.parse(fact.capturedAt) >= Date.parse(latest.capturedAt)) : [];
    notifications.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
    const [notification, previousNotification] = notifications;
    const selected = notification && (!previousNotification ||
      Date.parse(notification.capturedAt) > Date.parse(previousNotification.capturedAt)) ? notification : undefined;
    if (!selected) block(blockers, 'collaboration', 'submission.approved', collaboration.id);

    const acknowledgement = uniquePass(facts?.checks ?? [], 'notification_acknowledged');
    if (!selected || !uniquePass(collaboration.steps, 'notification_acknowledged') ||
        !acknowledgement || !eligible(acknowledgement) || acknowledgement.missionId !== collaboration.missionId ||
        acknowledgement.notificationId !== selected.entityId ||
        Date.parse(acknowledgement.capturedAt) < Date.parse(selected.capturedAt)) {
      block(blockers, 'collaboration', 'notification_acknowledged', collaboration.id);
    }
  }
  for (const code of travellerChecks) requireCheck('traveller', code);
  for (const code of manualChecks.slice(2)) requireCheck('manual', code);

  const executionComplete = blockers.length === 0;
  const stage = run.status === 'completed' ? 'completed' : !assessable ? 'blocked'
    : executionComplete ? 'execution_complete' : 'executing';
  return { stage, readyToBegin: false, executionComplete, blockers };
}

export function pilotCanPublish(
  input: PilotPublishEligibilityInput,
): { allowed: true } | { allowed: false; reason: PilotPublishBlockReason } {
  if (input.pilotLinked === false) return { allowed: true };
  if (input.runStatus !== 'running') return { allowed: false, reason: 'run_not_running' };
  if (input.pilotLinked !== true || input.intakeStatus !== 'approved') return { allowed: false, reason: 'intake_not_approved' };
  if (!positiveInteger(input.approvedDraftRevision) || input.currentDraftRevision !== input.approvedDraftRevision ||
      (input.publishedVersion !== null && input.publishedVersion !== input.approvedDraftRevision)) {
    return { allowed: false, reason: 'revision_changed' };
  }
  if (!present(input.approvedContentDigest) || input.approvedContentDigest !== input.currentContentDigest) {
    return { allowed: false, reason: 'digest_changed' };
  }
  if (input.creatorIsActive !== true) return { allowed: false, reason: 'creator_inactive' };
  if (input.guideIsWithdrawn !== false) return { allowed: false, reason: 'guide_withdrawn' };
  return { allowed: true };
}

export function pilotEvidenceEligible(
  capturedAt: string, acceptanceStartedAt: string | null, runStatus: PilotRunStatus,
): boolean {
  return runStatus === 'running' && afterAcceptanceStart(capturedAt, acceptanceStartedAt);
}

function afterAcceptanceStart(capturedAt: string, acceptanceStartedAt: string | null): boolean {
  if (!present(capturedAt) || !present(acceptanceStartedAt)) return false;
  const captured = Date.parse(capturedAt);
  const started = Date.parse(acceptanceStartedAt);
  return Number.isFinite(captured) && Number.isFinite(started) && captured > started;
}

// An opaque reference is a ref: prefix followed by a decimal ID or UUID.
const opaqueReference = /^ref:(?:[0-9]{1,20}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/iu;

export function pilotExportSummary(snapshot: OpsPilotSnapshot, exportedAt: string): PilotExportSummary {
  if (!present(exportedAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(exportedAt) ||
      !Number.isFinite(Date.parse(exportedAt))) {
    throw new RangeError('Invalid pilot export timestamp');
  }
  const { run, readiness, checks } = snapshot;
  return {
    schemaVersion: 1,
    exportedAt,
    run: run ? {
      id: run.id, status: run.status, dataClassification: run.dataClassification,
      candidateReleaseSha: run.candidateReleaseSha,
    } : null,
    readiness: {
      stage: readiness.stage, readyToBegin: readiness.readyToBegin, executionComplete: readiness.executionComplete,
      blockers: readiness.blockers.map(({ code, category, messageKey, recordId }) => ({
        code, category, messageKey, ...(recordId ? { recordId } : {}),
      })),
    },
    checks: checks.map(({ code, status, derived, evidenceReference }) => ({
      code, status, derived,
      evidenceReference: present(evidenceReference) && evidenceReference === evidenceReference.trim() &&
        opaqueReference.test(evidenceReference) ? evidenceReference : null,
    })),
  };
}
