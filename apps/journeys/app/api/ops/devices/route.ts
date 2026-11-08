import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { serverClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

const SURFACES = ['public_site', 'guide_reader', 'account', 'studio_editor', 'spaces_chat', 'ops_pages'] as const;
const PLATFORMS = ['ios_safari', 'android_chrome', 'voiceover', 'nvda'] as const;

function errorStatus(message: string) {
  if (/forbidden/.test(message)) return failure('FORBIDDEN', 403);
  if (/invalid_/.test(message)) return failure('INVALID', 400);
  return failure('UNAVAILABLE', 503);
}

/** Device and assistive-tech acceptance matrix (ops-only). */
export async function GET(request: Request) {
  const ctx = await apiContext(request, 'ops');
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_device_acceptance');
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data });
  } catch (error) {
    return errorStatus(error instanceof Error ? error.message : '');
  }
}

export async function POST(request: Request) {
  const ctx = await apiContext(request, 'ops', true);
  if (ctx.response) return ctx.response;
  if (!ctx.actor.roles.includes('ops')) return failure('FORBIDDEN', 403);
  let input: unknown;
  try {
    input = await boundedBody(request, 4096);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { surface?: unknown; platform?: unknown; outcome?: unknown; note?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.surface !== 'string' || !SURFACES.includes(body.surface as (typeof SURFACES)[number])) return failure('INVALID', 400);
  if (typeof body.platform !== 'string' || !PLATFORMS.includes(body.platform as (typeof PLATFORMS)[number])) return failure('INVALID', 400);
  if (body.outcome !== 'pass' && body.outcome !== 'fail') return failure('INVALID', 400);
  if (typeof body.note !== 'string' || body.note.trim().length < 20 || body.note.trim().length > 1000) return failure('INVALID', 400);
  try {
    const client = await serverClient();
    if (!client) throw new Error('unavailable');
    const response = await client.rpc('kinnso_ops_record_device_acceptance', {
      p_surface: body.surface,
      p_platform: body.platform,
      p_outcome: body.outcome,
      p_note: body.note.trim(),
    });
    if (response.error) throw new Error(response.error.message);
    return reply({ ok: true, data: response.data }, 201);
  } catch (error) {
    return errorStatus(error instanceof Error ? error.message : '');
  }
}
