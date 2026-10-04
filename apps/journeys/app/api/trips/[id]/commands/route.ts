import {successEvent,timedRpc} from '../../../../../lib/telemetry/server';
import { apiContext,backendFailure,boundedBody,failure,reply } from '../../../../../lib/api/server';
import { commandEnvelope,uuid } from '../../../../../lib/api/validation';
export async function POST(request: Request, {params}: {params:Promise<{id:string}>}) {
  const ctx = await apiContext(request,'trips',true); if (ctx.response) return ctx.response;
  const {id} = await params; if (!uuid(id)) return failure('NOT_FOUND',404);
  try {
    const body = commandEnvelope(await boundedBody(request));
    const result = await timedRpc(ctx.client,'apply_trip_command',{p_trip_id:id,p_expected_revision:body.expectedRevision,p_request_id:body.requestId,p_command:body.command},ctx.actor);
    if(!result.error&&body.command.type==='updateStop'&&'travellerNote' in body.command.patch)await successEvent(ctx.actor,'record_saved',body.requestId);
    return result.error ? backendFailure(result.error) : reply({ok:true,data:result.data});
  } catch { return failure('INVALID',400); }
}
