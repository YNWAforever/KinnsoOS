import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

const KINDS = ['export', 'delete', 'access', 'correction'] as const;
const SCOPES = ['ai_conversations', 'creator_content', 'account'] as const;

export async function GET(request: Request) {
  const ctx = await apiContext(request, 'conversation');
  if (ctx.response) return ctx.response;
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_my_privacy_requests');
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: { items: response.data ?? [] } });
  } catch {
    return failure('UNAVAILABLE', 503);
  }
}

export async function POST(request: Request) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  let input: unknown;
  try {
    input = await boundedBody(request, 8192);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { kind?: unknown; scope?: unknown; note?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.kind !== 'string' || !KINDS.includes(body.kind as (typeof KINDS)[number])) return failure('INVALID', 400);
  if (typeof body.scope !== 'string' || !SCOPES.includes(body.scope as (typeof SCOPES)[number])) return failure('INVALID', 400);
  if (typeof body.note !== 'string' || body.note.length > 1000) return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_privacy_request', {
      p_kind: body.kind,
      p_scope: body.scope,
      p_note: body.note,
    });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/invalid_/.test(message)) return failure('INVALID', 400);
    if (/actor_required|forbidden/.test(message)) return failure('FORBIDDEN', 403);
    return failure('UNAVAILABLE', 503);
  }
}
