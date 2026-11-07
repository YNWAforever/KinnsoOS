import { emitPilotMetric } from '../../../../../../lib/pilot/telemetry.ts';
import {successEvent,timedRpc} from '../../../../../../lib/telemetry/server';
import { apiContext, backendFailure, boundedBody, failure, reply } from '../../../../../../lib/api/server';
import { object, uuid } from '../../../../../../lib/api/validation';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 const ctx = await apiContext(request, 'creator', true); if (ctx.response) return ctx.response;
 const { id } = await context.params; if (!uuid(id)) return failure('INVALID', 400);
 let requestId: string;
 let expectedRevision: number;
 try {
  const body = object(await boundedBody(request), ['expectedRevision', 'requestId']);
  if (!uuid(body.requestId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) return failure('INVALID', 400);
  requestId = body.requestId;
  expectedRevision = Number(body.expectedRevision);
 } catch { return failure('INVALID', 400); }
 try {
  const result = await timedRpc(ctx.client,'publish_kinnso_pilot_guide_draft', { p_draft_id: id, p_expected_revision: expectedRevision, p_request_id: requestId },ctx.actor);
  if (result.error) {
    switch (result.error.message) {
      case 'CONFLICT':
      case 'REQUEST_ID_REUSED': return failure('CONFLICT', 409);
      case 'AUTH_REQUIRED': return failure('AUTH_REQUIRED', 401);
      case 'FORBIDDEN': return failure('FORBIDDEN', 403);
      case 'INVALID': return failure('INVALID', 400);
      default: return backendFailure(result.error);
    }
  }
  const { _pilotReplay, ...data } = result.data ?? {};
  const { runId, contentIntakeId } = data;
  if (_pilotReplay === false && uuid(runId) && uuid(contentIntakeId))
    await emitPilotMetric('pilot.content.published', { runId, contentIntakeId });
  if (_pilotReplay !== true) await successEvent(ctx.actor, 'guide_published', requestId);
  return reply({ ok: true, data });
 } catch { return failure('UNAVAILABLE', 503); }
}
