import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isLocale } from '@/lib/i18n/config'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'

/**
 * GET /[locale]/auth/callback?code=...
 *
 * Supabase redirects here after:
 *   - Email confirmation (sign-up flow)
 *   - OAuth provider redirect (e.g. Google)
 *
 * Exchanges the one-time code for a session cookie, then sends the user
 * to the creator dashboard. On error, redirects to sign-in.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const code = request.nextUrl.searchParams.get('code')

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(`/${locale}/creator`, request.url))
    }
  }

  // Missing code or exchange error — redirect back to sign-in.
  return NextResponse.redirect(new URL(`/${locale}/sign-in?error=callback`, request.url))
}
