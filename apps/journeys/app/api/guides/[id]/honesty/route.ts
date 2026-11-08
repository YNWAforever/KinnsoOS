import { failure, reply } from '../../../../../lib/api/server';
import { uuid } from '../../../../../lib/api/validation';
import { capabilities } from '../../../../../lib/contracts/capabilities';
import { getGuideHonesty } from '../../../../../lib/content-honesty/server';

export const dynamic = 'force-dynamic';

/** Public, signed-out read of a published guide's content-honesty projection.
 *
 * apiContext is deliberately not used: it requires an authenticated actor and
 * would 401 anonymous readers, while public.kinnso_guide_honesty is granted to
 * anon. The 'catalog' capability gate below is the same connected-mode check
 * apiContext applies before calling the backend. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid(id)) return failure('INVALID', 400);
  if (capabilities(process.env)['catalog']?.mode !== 'connected') return failure('UNAVAILABLE', 503);
  try {
    return reply({ ok: true, data: await getGuideHonesty(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('guide_not_found')) return failure('NOT_FOUND', 404);
    return failure('UNAVAILABLE', 503);
  }
}
