import { NextResponse } from 'next/server';
import { serverClient } from '../../../lib/supabase/server';
import { safeReturnPath } from '../../../lib/auth/return-path';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = await serverClient();
  const code = url.searchParams.get('code');
  const next = safeReturnPath(url.searchParams.get('next'));
  if (client && code) {
    const result = await client.auth.exchangeCodeForSession(code);
    if (!result.error) return NextResponse.redirect(new URL(next, url.origin), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  return NextResponse.redirect(new URL(`/en/sign-in?error=failed&next=${encodeURIComponent(next)}`, url.origin), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
