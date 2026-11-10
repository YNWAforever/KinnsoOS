import { failure, reply } from '../../../../../lib/api/server';
import { uuid } from '../../../../../lib/api/validation';
import { capabilities } from '../../../../../lib/contracts/capabilities';
import { serverClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Public read of a published guide's blocked date ranges (creator-declared). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (capabilities(process.env)['catalog']?.mode !== 'connected') return failure('UNAVAILABLE', 503);
  try {
    const client = await serverClient();
    if (!client) return failure('UNAVAILABLE', 503);
    const response = await client.rpc('kinnso_guide_unavailable', { p_guide_id: id });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: { ranges: response.data ?? [] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('guide_not_found')) return failure('NOT_FOUND', 404);
    return failure('UNAVAILABLE', 503);
  }
}
