import { NextResponse } from 'next/server';
import { serverClient } from '../../../lib/supabase/server';
import { safeReturnPath } from '../../../lib/auth/return-path';
import {callbackOrigin} from '../../../lib/auth/callback-origin';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin=callbackOrigin(process.env);
  if(!origin)return Response.json({ok:false,code:'UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});
  const client = await serverClient();
  const code = url.searchParams.get('code');
  const next = safeReturnPath(url.searchParams.get('next'));
  if (client && code) {
    const result = await client.auth.exchangeCodeForSession(code);
    if (!result.error) return NextResponse.redirect(new URL(next, origin), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  return NextResponse.redirect(new URL(`/en/sign-in?error=failed&next=${encodeURIComponent(next)}`, origin), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
