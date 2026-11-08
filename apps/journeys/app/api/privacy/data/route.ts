import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

function errorCode(message: string) {
  if (/actor_required|forbidden|not_authorized/.test(message)) return 'FORBIDDEN' as const;
  if (/invalid_/.test(message)) return 'INVALID' as const;
  if (/request_not_found/.test(message)) return 'NOT_FOUND' as const;
  return 'UNAVAILABLE' as const;
}

/** Export every AI conversation and creator record this account owns. */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_export_account_data');
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    const code = errorCode(error instanceof Error ? error.message : '');
    return failure(code, code === 'FORBIDDEN' ? 403 : code === 'INVALID' ? 400 : code === 'NOT_FOUND' ? 404 : 503);
  }
}

/** Bulk deletion of data that is safe to erase. Published guides are withdrawn
 * through the studio workflow, not deleted here; those go through the request channel. */
export async function POST(request: Request) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  let input: unknown;
  try {
    input = await boundedBody(request, 4096);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { scope?: unknown; confirm?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (body.scope !== 'ai_conversations' && body.scope !== 'creator_drafts') return failure('INVALID', 400);
  if (body.confirm !== true) return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const name = body.scope === 'ai_conversations' ? 'kinnso_delete_ai_conversations' : 'kinnso_delete_creator_drafts';
    const response = await client.rpc(name);
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: { scope: body.scope, removed: response.data } });
  } catch (error) {
    const code = errorCode(error instanceof Error ? error.message : '');
    return failure(code, code === 'FORBIDDEN' ? 403 : code === 'INVALID' ? 400 : 503);
  }
}
