import { apiContext, backendFailure, boundedBody, failure, reply } from '../../../../lib/api/server';
import { object, uuid } from '../../../../lib/api/validation';
import { resumeStep, type JobSnapshot } from '../../../../lib/creators/progress';
import { emptyProfile } from '../../../../lib/creators/contracts';
export async function GET(request: Request) {
 const ctx = await apiContext(request, 'creator'); if (ctx.response) return ctx.response;
 const results = await Promise.all([
  ctx.client.from('creators').select('status').eq('id', ctx.actor.id).maybeSingle(),
  ctx.client.from('creator_scan_jobs').select('id,status').eq('creator_id', ctx.actor.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1),
  ctx.client.from('creator_social_handles').select('platform,handle').eq('creator_id', ctx.actor.id),
  ctx.client.from('creator_dna').select('final,ai_draft').eq('creator_id', ctx.actor.id).maybeSingle(),
 ]);
 const error = results.find(r => r.error)?.error; if (error) return backendFailure(error);
 const status = results[0].data?.status ?? null;
 if (status && !['onboarding', 'active'].includes(status)) return failure('FORBIDDEN', 403);
 const job = (results[1].data?.[0] ?? null) as JobSnapshot | null;
 const handles = results[2].data ?? [];
 const source = results[3].data?.final ?? results[3].data?.ai_draft ?? {};
 const profile = emptyProfile();
 profile.bio = typeof source.bio === 'string' ? source.bio.slice(0, 4000) : '';
 for (const key of ['niches', 'content_pillars', 'tone', 'languages'] as const) profile[key] = Array.isArray(source[key]) ? source[key].filter((s: unknown) => typeof s === 'string').slice(0, 20).map((s: string) => s.slice(0, 120)) : [];
 return reply({ ok: true, data: { step: resumeStep(status, job, handles.length), jobId: job?.id ?? null, jobStatus: job?.status ?? null, retryable: job?.status === 'failed', handles, profile, profileReady: Boolean(results[3].data?.final ?? results[3].data?.ai_draft), scanAvailable: false } });
}
export async function POST(request: Request) {
 const ctx = await apiContext(request, 'creator', true); if (ctx.response) return ctx.response;
 try {
  const body = object(await boundedBody(request, 16384), ['requestId', 'profile', 'confirmed']);
  if (!uuid(body.requestId) || body.confirmed !== true) return failure('INVALID', 400);
  const result = await ctx.client.rpc('confirm_kinnso_creator_profile', { p_request_id: body.requestId, p_profile: body.profile, p_confirmed: true });
  return result.error ? backendFailure(result.error) : reply({ ok: true, data: result.data });
 } catch { return failure('INVALID', 400); }
}
