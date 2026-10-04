import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import type { GuideInput } from '@/lib/guides/types'
import { validateGuideInput, type ValidationErrors } from '@/lib/guides/validation'
import { makeSlug, slugify } from '@/lib/guides/slug'

type Supabase = SupabaseClient<Database>
type GuideInsert = Database['public']['Tables']['guides']['Insert']
type GuideUpdate = Database['public']['Tables']['guides']['Update']

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const defaultLocale = 'en'
const localePattern = /^[a-z]{2}(?:-[a-z]{2})?$/

const normalizeLocale = (locale?: string) => {
  const value = locale?.trim().toLowerCase()
  return value && localePattern.test(value) ? value : defaultLocale
}

const localizedPath = (locale: string | undefined, path: string) =>
  `/${normalizeLocale(locale)}${path}`

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })

async function getSupabase(): Promise<Supabase> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server')
  return createSupabaseServerClient()
}

type AuthedCreator = { id: string; displayName: string | null; handle: string | null }

/**
 * Guides are public, creator-authored content, so writing one requires an
 * ACTIVE creator — not merely a signed-in account.
 *
 * Every sign-up gets a blank `creators` row (handle_new_user()), so row
 * existence alone would let any traveller or merchant publish to /explore,
 * /g/[slug] and the sitemap. `status = 'active'` is the same bar
 * `resolveViewerRole()` and /studio already use for a "real" creator.
 */
async function getAuthedCreator(
  supabase: Supabase,
): Promise<{ ok: true; creator: AuthedCreator } | ActionFailure> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return formError('Sign in is required')

  const { data: creator } = await supabase
    .from('creators')
    .select('display_name, handle, status')
    .eq('id', user.id)
    .maybeSingle()
  if (creator?.status !== 'active') return formError('Creator access is required')

  return {
    ok: true,
    creator: {
      id: user.id,
      displayName: creator.display_name ?? null,
      handle: creator.handle ?? null,
    },
  }
}

async function revalidate(paths: string[]) {
  const { revalidatePath } = await import('next/cache')
  paths.forEach((path) => revalidatePath(path))
}

function trimInput(input: GuideInput): GuideInput {
  return {
    title: input.title.trim(),
    city: input.city.trim(),
    coverUrl: input.coverUrl.trim(),
    summary: input.summary.trim(),
  }
}

export async function createGuideAction(
  rawInput: GuideInput,
  options: { publish: boolean; locale: string },
): Promise<ActionResult<{ id: string; slug: string }>> {
  'use server'

  const input = trimInput(rawInput)
  const validation = validateGuideInput(input)
  if (!validation.ok) return validation

  const supabase = await getSupabase()
  const auth = await getAuthedCreator(supabase)
  if (!auth.ok) return auth
  const creator = auth.creator

  const name = creator.displayName?.trim() || 'Creator'
  const handle = creator.handle ?? slugify(name)
  const slug = makeSlug(input.title, randomUUID().slice(0, 6))

  const payload: GuideInsert = {
    creator_id: creator.id,
    creator_handle: handle,
    creator_name: name,
    slug,
    title: input.title,
    summary: input.summary,
    cover_url: input.coverUrl,
    city: input.city,
    status: options.publish ? 'published' : 'draft',
    published_at: options.publish ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase.from('guides').insert(payload).select('id, slug').single()
  if (error || !data) return formError('Guide could not be saved')

  await revalidate([localizedPath(options.locale, '/studio/guides'), localizedPath(options.locale, '/explore')])
  return { ok: true, id: data.id, slug: data.slug }
}

export async function updateGuideAction(
  id: string,
  rawInput: GuideInput,
  options: { publish: boolean; locale: string },
): Promise<ActionResult<{ id: string }>> {
  'use server'

  const input = trimInput(rawInput)
  const validation = validateGuideInput(input)
  if (!validation.ok) return validation

  const supabase = await getSupabase()
  const auth = await getAuthedCreator(supabase)
  if (!auth.ok) return auth

  // Read current row (RLS scopes to owner) to decide publish_at transition.
  const { data: current } = await supabase
    .from('guides')
    .select('status, published_at')
    .eq('id', id)
    .maybeSingle()
  if (!current) return formError('Guide not found')

  const willPublish = options.publish || current.status === 'published'
  const update: GuideUpdate = {
    title: input.title,
    summary: input.summary,
    cover_url: input.coverUrl,
    city: input.city,
    status: willPublish ? 'published' : 'draft',
    published_at: willPublish ? (current.published_at ?? new Date().toISOString()) : null,
  }

  const { data, error } = await supabase
    .from('guides')
    .update(update)
    .eq('id', id)
    .select('id')
    .single()
  if (error || !data) return formError('Guide could not be saved')

  await revalidate([localizedPath(options.locale, '/studio/guides'), localizedPath(options.locale, '/explore')])
  return { ok: true, id: data.id }
}

export async function deleteGuideAction(
  id: string,
  options: { locale: string },
): Promise<{ ok: true } | ActionFailure> {
  'use server'

  const supabase = await getSupabase()
  const auth = await getAuthedCreator(supabase)
  if (!auth.ok) return auth
  const creator = auth.creator

  const { error } = await supabase.from('guides').delete().eq('id', id).eq('creator_id', creator.id)
  if (error) return formError('Guide could not be deleted')

  await revalidate([localizedPath(options.locale, '/studio/guides'), localizedPath(options.locale, '/explore')])
  return { ok: true }
}
