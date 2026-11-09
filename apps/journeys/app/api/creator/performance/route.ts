import { apiContext, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Creator-scoped aggregate performance for authored guides. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'creator');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('creator')) return failure('FORBIDDEN', 403);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_creator_guide_performance');
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/creator_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
