import { revalidatePath } from 'next/cache'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validateTestimonialInput, type TestimonialInput } from '@/lib/admin/testimonials-validation'
import { LOCALES, type Locale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const adminTestimonialsPath = (locale: Locale) => `/${locale}/admin/testimonials`

/** Refresh every public testimonial consumer after a successful ops mutation. */
function revalidateTestimonialSurfaces(locale: Locale) {
  revalidatePath(adminTestimonialsPath(locale))
  for (const l of LOCALES) {
    revalidatePath(`/${l}`)
    revalidatePath(`/${l}/for-creators`)
    revalidatePath(`/${l}/for-merchants`)
  }
}

/**
 * camelCase form input → snake_case columns. `status` is deliberately absent:
 * new rows start at the DB default 'draft'; publishing is its own action.
 */
function toRow(input: TestimonialInput) {
  return {
    quote: input.quote.trim(),
    author_name: input.authorName.trim(),
    author_role: input.authorRole,
    locale: input.locale,
    sort_order: input.sortOrder,
  }
}

export async function createTestimonialAction(
  locale: Locale,
  input: TestimonialInput,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const errors = validateTestimonialInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data, error } = await supabase.from('testimonials').insert(toRow(input)).select('id').single()
  if (error || !data) {
    if (error) console.error('[admin:testimonials] create failed', error)
    return formError('Testimonial could not be created')
  }

  revalidateTestimonialSurfaces(locale)
  return { ok: true, id: data.id as string }
}

export async function updateTestimonialAction(
  locale: Locale,
  id: string,
  input: TestimonialInput,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const errors = validateTestimonialInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data, error } = await supabase
    .from('testimonials')
    .update(toRow(input))
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:testimonials] update failed', error)
    return formError('Testimonial could not be updated')
  }

  revalidateTestimonialSurfaces(locale)
  return { ok: true, id }
}

export async function setTestimonialStatusAction(
  locale: Locale,
  id: string,
  status: 'draft' | 'published',
): Promise<ActionResult<{ id: string; status: 'draft' | 'published' }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (status !== 'draft' && status !== 'published') return formError('Invalid status')

  const { data, error } = await supabase
    .from('testimonials')
    .update({ status })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:testimonials] setStatus failed', error)
    return formError('Testimonial status could not be changed')
  }

  revalidateTestimonialSurfaces(locale)
  return { ok: true, id, status }
}

export async function deleteTestimonialAction(
  locale: Locale,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('testimonials')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:testimonials] delete failed', error)
    return formError('Testimonial could not be deleted')
  }

  revalidateTestimonialSurfaces(locale)
  return { ok: true, id }
}
