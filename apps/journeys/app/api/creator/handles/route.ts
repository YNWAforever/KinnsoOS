import { apiContext, backendFailure, boundedBody, failure, reply } from '../../../../lib/api/server';
import { object } from '../../../../lib/api/validation';
import { validateHandle, handleUrl, isPlatform } from '../../../../lib/creators/handles';
export async function POST(request: Request) {
 const ctx = await apiContext(request, 'creator', true); if (ctx.response) return ctx.response;
 const creator = await ctx.client.from('creators').select('status').eq('id', ctx.actor.id).single();
 if (creator.error) return backendFailure(creator.error);
 if (!['onboarding', 'active'].includes(creator.data.status)) return failure('FORBIDDEN', 403);
 try {
  const body = object(await boundedBody(request, 4096), ['handles']);
  if (!Array.isArray(body.handles) || body.handles.length < 1 || body.handles.length > 3) return failure('INVALID', 400);
  const used = new Set<string>();
  const rows = body.handles.map(value => {
   const row = object(value, ['platform', 'handle']);
   if (typeof row.platform !== 'string' || typeof row.handle !== 'string' || !isPlatform(row.platform) || used.has(row.platform)) throw Error('INVALID');
   const valid = validateHandle(row.platform, row.handle); if (!valid.ok) throw Error('INVALID');
   used.add(row.platform); return { creator_id: ctx.actor.id, platform: row.platform, handle: valid.value, url: handleUrl(row.platform, valid.value) };
  });
  const result = await ctx.client.from('creator_social_handles').upsert(rows, { onConflict: 'creator_id,platform' });
  return result.error ? backendFailure(result.error) : reply({ ok: true, data: { saved: true } });
 } catch { return failure('INVALID', 400); }
}
