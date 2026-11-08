import { apiContext, failure, reply } from '../../../../lib/api/server';
import { usage } from '../../../../lib/chat/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  try {
    return reply({ ok: true, data: await usage() });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}
