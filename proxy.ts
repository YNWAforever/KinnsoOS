import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { backendTarget } from './lib/contracts/capabilities';

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-kinnso-locale', request.nextUrl.pathname.split('/')[1] === 'en' ? 'en' : 'zh-HK');
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const target = backendTarget(process.env);
  if (target) {
    const client = createServerClient(target.origin, target.key, { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        requestHeaders.set('cookie', request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    } });
    await client.auth.getUser();
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/|favicon.svg|photos|source|licenses).*)'] };
