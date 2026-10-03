import { apiContext,backendFailure,boundedBody,failure,reply } from '../../../../../lib/api/server';
import { commandEnvelope,uuid } from '../../../../../lib/api/validation';
export async function POST(request: Request, {params}: {params:Promise<{id:string}>}) {
  const ctx = await apiContext(request,'trips',true); if (ctx.response) return ctx.response;
  const {id} = await params; if (!uuid(id)) return failure('NOT_FOUND',404);
  try {
    const body = commandEnvelope(await boundedBody(request));
    const result = await ctx.client.rpc('apply_trip_command',{p_trip_id:id,p_expected_revision:body.expectedRevision,p_request_id:body.requestId,p_command:body.command});
    return result.error ? backendFailure(result.error) : reply({ok:true,data:result.data});
  } catch { return failure('INVALID',400); }
}
