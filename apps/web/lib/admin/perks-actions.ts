import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { validatePerkInput, slugify, uniqueSlug, type PerkInput } from '@/lib/admin/perks-validation'
import type { Locale } from '@/lib/i18n/config'

const adminPerksPath = (locale: Locale) => `/${locale}/admin/perks`

/** Map the camelCase form input to the snake_case table columns. */
function toRow(input: PerkInput) {
  return {
    partner_name: input.partnerName.trim(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    category: input.category.trim(),
    discount_label: input.discountLabel.trim(),
    min_tier: input.minTier,
    redemption_type: input.redemptionType,
    redemption_value: input.redemptionValue.trim(),
    sort_order: input.sortOrder,
    active: input.active,
  }
}

export async function createPerkAction(
  locale: Locale,
  input: PerkInput,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const errors = validatePerkInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data: existing } = await supabase.from('partner_perks').select('slug')
  const slug = uniqueSlug(slugify(input.title), (existing ?? []).map((r) => r.slug as string))
  const { data, error } = await supabase
    .from('partner_perks')
    .insert({ ...toRow(input), slug })
    .select('id')
    .single()
  if (error || !data) {
    if (error) console.error('[admin:perks] create failed', error)
    return formError('Perk could not be created')
  }

  revalidatePath(adminPerksPath(locale))
  return { ok: true, id: data.id as string }
}

export async function updatePerkAction(
  locale: Locale,
  id: string,
  input: PerkInput,
): Promise<ActionResult<{ id: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const errors = validatePerkInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data, error } = await supabase
    .from('partner_perks')
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:perks] update failed', error)
    return formError('Perk could not be updated')
  }

  revalidatePath(adminPerksPath(locale))
  return { ok: true, id }
}

export async function togglePerkActiveAction(
  locale: Locale,
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string; active: boolean }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('partner_perks')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:perks] toggleActive failed', error)
    return formError('Perk status could not be changed')
  }

  revalidatePath(adminPerksPath(locale))
  return { ok: true, id, active }
}
