import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { backendTarget } from './lib/contracts/capabilities';
import { legacyEntry } from './lib/routing/legacy-entry';
import {publicLanguage} from './lib/seo/public-language';

export async function proxy(request: NextRequest) {
  // Compose locale normalization with safe page aliases after refreshing cookies.
  const path=request.nextUrl.pathname;
  const normalizedPath=path.replace(/^\/zh-hk(?=\/|$)/,'/zh-HK');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-kinnso-locale', publicLanguage(normalizedPath.split('/')[1])??'zh-HK');
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
  const entry=legacyEntry(request.nextUrl.pathname,request.method);
  if(entry||(['GET','HEAD'].includes(request.method)&&normalizedPath!==path)){
    const destination=request.nextUrl.clone();destination.pathname=entry?.pathname??normalizedPath;
    for(const [name,value] of Object.entries(entry?.search??{}))destination.searchParams.set(name,value);
    const redirected=NextResponse.redirect(destination,307);
    for(const cookie of response.cookies.getAll())redirected.cookies.set(cookie);
    response=redirected;
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/|favicon.svg|photos|source|licenses).*)'] };
