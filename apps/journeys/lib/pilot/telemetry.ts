import { uuid } from '../api/validation.ts';
import type { PilotMetricAction, PilotMetricIdentifiers } from '../contracts/pilot.ts';

const checkCodes = new Set([
  'creator_public', 'guide_discovered', 'guide_saved', 'trip_adopted', 'trip_revised', 'trip_recovered',
  'support_resolved', 'support_acknowledged', 'privacy_support', 'alert_owner',
  'physical_ios', 'physical_android', 'voiceover', 'nvda',
  'merchant_approved', 'mission_published', 'application_active', 'submission_approved',
  'submission.approved', 'notification_acknowledged',
]);
const runStatuses = ['draft', 'recruiting', 'paused', 'running', 'completed', 'cancelled'];
const participantStatuses = ['invited', 'joined', 'active', 'paused', 'withdrawn', 'completed'];
const rules: Record<PilotMetricAction, { fields: string[]; statuses?: string[] }> = {
  'pilot.run.created': { fields: [] },
  'pilot.run.configured': { fields: [] },
  'pilot.run.status_changed': { fields: ['status'], statuses: runStatuses },
  'pilot.invite.created': { fields: ['participantId'] },
  'pilot.participant.joined': { fields: ['participantId'] },
  'pilot.participant.status_changed': { fields: ['participantId', 'status'], statuses: participantStatuses },
  'pilot.consent.accepted': { fields: ['participantId'] },
  'pilot.content.submitted': { fields: ['participantId', 'contentIntakeId'] },
  'pilot.content.reviewed': { fields: ['contentIntakeId', 'status'], statuses: ['approved', 'rejected'] },
  'pilot.content.published': { fields: ['contentIntakeId'] },
  'pilot.guide.bound': { fields: ['contentIntakeId'] },
  'pilot.collaboration.bound': { fields: [] },
  'pilot.evidence.added': { fields: ['participantId', 'checkCode'] },
  'pilot.notification.acknowledged': { fields: ['participantId'] },
  'pilot.support.acknowledged': { fields: ['participantId'] },
  'pilot.check.changed': { fields: ['checkCode', 'status'], statuses: ['not_run', 'pass', 'fail', 'blocked'] },
};

export async function emitPilotMetric(action: PilotMetricAction, ids: PilotMetricIdentifiers): Promise<void> {
  try {
    if (!Object.hasOwn(rules, action) || !ids || typeof ids !== 'object' || Array.isArray(ids)) return;
    const rule = rules[action];
    if (!uuid(ids.runId) || Object.keys(ids).some(key => key !== 'runId' && !rule.fields.includes(key))) return;
    const event: Record<string, string> = { action, runId: ids.runId };
    for (const key of rule.fields) {
      const value = ids[key as keyof PilotMetricIdentifiers];
      if (value === undefined) continue;
      if (key === 'status' ? !rule.statuses?.includes(value)
        : key === 'checkCode' ? !checkCodes.has(value) : !uuid(value)) return;
      event[key] = value;
    }
    console.info(event);
  } catch {}
}
