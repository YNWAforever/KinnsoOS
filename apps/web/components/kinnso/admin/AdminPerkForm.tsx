'use client'
import { useState } from 'react'
import type { Messages } from '@/lib/i18n/messages/en'
import type { AdminPerk } from '@/lib/admin/perks-queries'
import type { PerkInput } from '@/lib/admin/perks-validation'
import type { ActionResult } from '@/lib/admin/result'

type T = Messages['perks']['admin']
type SaveResult = ActionResult<{ id: string }>

const TIER_OPTIONS = ['', 'rising', 'pro', 'elite'] as const

function toInput(perk: AdminPerk | null): PerkInput {
  return {
    partnerName: perk?.partner_name ?? '',
    title: perk?.title ?? '',
    summary: perk?.summary ?? '',
    category: perk?.category ?? '',
    discountLabel: perk?.discount_label ?? '',
    minTier: (perk?.min_tier ?? null) as PerkInput['minTier'],
    redemptionType: (perk?.redemption_type ?? 'code') as PerkInput['redemptionType'],
    redemptionValue: perk?.redemption_value ?? '',
    sortOrder: perk?.sort_order ?? 0,
    active: perk?.active ?? true,
  }
}

export function AdminPerkForm({
  t, perk, onSave, onCancel,
}: {
  t: T
  perk: AdminPerk | null
  onSave: (input: PerkInput) => Promise<SaveResult>
  onCancel: () => void
}) {
  const [form, setForm] = useState<PerkInput>(toInput(perk))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)

  const set = <K extends keyof PerkInput>(key: K, value: PerkInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const result = await onSave(form)
      if (!result.ok) setErrors(result.errors)
      else onCancel()
    } catch {
      setErrors({ form: ['Perk could not be saved'] })
    } finally {
      setPending(false)
    }
  }

  const tierLabel = (v: string) =>
    v === '' ? t.tierOpen : v === 'rising' ? t.tierRising : v === 'pro' ? t.tierPro : t.tierElite

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-bold text-kinnso-ink">{t.fieldPartner}</span>
        <input className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.partnerName}
          onChange={(e) => set('partnerName', e.target.value)} />
        {errors.partnerName && <span className="text-sm text-red-600">{errors.partnerName[0]}</span>}
      </label>
      <label className="block">
        <span className="text-sm font-bold text-kinnso-ink">{t.fieldTitle}</span>
        <input className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.title}
          onChange={(e) => set('title', e.target.value)} />
        {errors.title && <span className="text-sm text-red-600">{errors.title[0]}</span>}
      </label>
      <label className="block">
        <span className="text-sm font-bold text-kinnso-ink">{t.fieldSummary}</span>
        <textarea className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.summary}
          onChange={(e) => set('summary', e.target.value)} />
        {errors.summary && <span className="text-sm text-red-600">{errors.summary[0]}</span>}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-kinnso-ink">{t.fieldCategory}</span>
          <input className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.category}
            onChange={(e) => set('category', e.target.value)} />
          {errors.category && <span className="text-sm text-red-600">{errors.category[0]}</span>}
        </label>
        <label className="block">
          <span className="text-sm font-bold text-kinnso-ink">{t.fieldDiscount}</span>
          <input className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.discountLabel}
            onChange={(e) => set('discountLabel', e.target.value)} />
          {errors.discountLabel && <span className="text-sm text-red-600">{errors.discountLabel[0]}</span>}
        </label>
        <label className="block">
          <span className="text-sm font-bold text-kinnso-ink">{t.fieldMinTier}</span>
          <select className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.minTier ?? ''}
            onChange={(e) => set('minTier', (e.target.value || null) as PerkInput['minTier'])}>
            {TIER_OPTIONS.map((v) => <option key={v} value={v}>{tierLabel(v)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-kinnso-ink">{t.fieldRedemptionType}</span>
          <select className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.redemptionType}
            onChange={(e) => set('redemptionType', e.target.value as PerkInput['redemptionType'])}>
            <option value="code">{t.typeCode}</option>
            <option value="link">{t.typeLink}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-kinnso-ink">{t.fieldRedemptionValue}</span>
          <input className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.redemptionValue}
            onChange={(e) => set('redemptionValue', e.target.value)} />
          {errors.redemptionValue && <span className="text-sm text-red-600">{errors.redemptionValue[0]}</span>}
        </label>
        <label className="block">
          <span className="text-sm font-bold text-kinnso-ink">{t.fieldSortOrder}</span>
          <input type="number" step="1" className="mt-1 w-full rounded-lg border border-kinnso-edge px-3 py-2" value={form.sortOrder}
            onChange={(e) => set('sortOrder', Math.trunc(Number(e.target.value)) || 0)} />
          {errors.sortOrder && <span className="text-sm text-red-600">{errors.sortOrder[0]}</span>}
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        <span className="text-sm font-bold text-kinnso-ink">{t.fieldActive}</span>
      </label>
      {errors.form && <p className="text-sm text-red-600">{errors.form[0]}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending}
          className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white disabled:opacity-60">{t.save}</button>
        <button type="button" onClick={onCancel}
          className="rounded-full border border-kinnso-edge px-5 py-2 font-bold text-kinnso-ink">{t.cancel}</button>
      </div>
    </form>
  )
}

export default AdminPerkForm
