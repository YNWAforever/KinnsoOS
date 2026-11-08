import { apiContext, failure, reply } from '../../../../lib/api/server';
import { searchChats } from '../../../../lib/chat/server';
import { searchLimit, searchQuery } from '../../../../lib/chat/contracts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  const params = new URL(request.url).searchParams;
  const query = searchQuery(params.get('q'));
  if (!query) return failure('INVALID', 400);
  const limit = searchLimit(params.get('limit'));
  try {
    return reply({ ok: true, data: { query, items: await searchChats(query, limit) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('invalid_search')) return failure('INVALID', 400);
    return failure('UNAVAILABLE', 503);
  }
}
