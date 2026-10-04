'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TicketCard } from '@/components/kinnso/MarketPassport'
import type { ActionResult } from '@/lib/admin/result'
import type { AdminTestimonial } from '@/lib/admin/testimonials-queries'
import { TESTIMONIAL_ROLES, type TestimonialInput, type TestimonialRole } from '@/lib/admin/testimonials-validation'
import { isLocale, LOCALES } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type SaveResult = ActionResult<{ id: string }>
type MutateResult = ActionResult<{ id: string }>
type T = Messages['testimonialsAdmin']

/**
 * Ops CRUD for homepage testimonials. Deliberately the LEGACY admin skin
 * (TicketCard / k-display / kinnso-*): the operator console is not part of
 * the R1 public re-skin.
 */
export function AdminTestimonialsView({
  t, testimonials, onCreate, onUpdate, onSetStatus, onDelete,
}: {
  t: T
  testimonials: AdminTestimonial[]
  onCreate: (input: TestimonialInput) => Promise<SaveResult>
  onUpdate: (id: string, input: TestimonialInput) => Promise<SaveResult>
  onSetStatus: (id: string, status: 'draft' | 'published') => Promise<MutateResult>
  onDelete: (id: string) => Promise<MutateResult>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<AdminTestimonial | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  const roleLabel: Record<TestimonialRole, string> = {
    creator: t.roleCreator, traveller: t.roleTraveller, merchant: t.roleMerchant,
  }

  async function mutate(id: string, run: () => Promise<MutateResult>, fallback: string) {
    setBusyId(id)
    setRowErrors((e) => ({ ...e, [id]: '' }))
    try {
      const res = await run()
      if (res.ok) {
        router.refresh() // reconcile with the revalidated server truth
      } else {
        setRowErrors((e) => ({ ...e, [id]: res.errors.form?.[0] ?? fallback }))
      }
    } catch {
      setRowErrors((e) => ({ ...e, [id]: fallback }))
    } finally {
      setBusyId(null)
    }
  }

  if (editing !== null) {
    const current = editing === 'new' ? null : editing
    return (
      <main>
        <h1 className="k-display">{current ? t.formEditTitle : t.formNewTitle}</h1>
        <div className="mt-6 max-w-2xl">
          <TestimonialForm
            t={t}
            roleLabel={roleLabel}
            testimonial={current}
            onSave={(input) => (current ? onUpdate(current.id, input) : onCreate(input))}
            onDone={() => { setEditing(null); router.refresh() }}
            onCancel={() => setEditing(null)}
          />
        </div>
      </main>
    )
  }

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="k-display">{t.title}</h1>
          <p className="mt-2 text-kinnso-muted">{t.subtitle}</p>
        </div>
        <button onClick={() => setEditing('new')} className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white">
          {t.newCta}
        </button>
      </div>
      {testimonials.length === 0 ? (
        <p className="mt-8 text-kinnso-muted">{t.empty}</p>
      ) : (
        <div className="mt-8 grid gap-4">
          {testimonials.map((row) => (
            <TicketCard key={row.id} className="p-5">
              <blockquote className="text-kinnso-ink">&ldquo;{row.quote}&rdquo;</blockquote>
              <p className="mt-2 text-sm text-kinnso-muted">
                {row.author_name} · {roleLabel[row.author_role as TestimonialRole] ?? row.author_role} ·{' '}
                {row.locale ?? t.localeAll} · #{row.sort_order}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-bold">
                <span className={row.status === 'published' ? 'text-kinnso-orange' : 'text-kinnso-muted'}>
                  {row.status === 'published' ? t.statusPublished : t.statusDraft}
                </span>
                <button
                  disabled={busyId === row.id}
                  className="text-kinnso-ink hover:text-kinnso-orange"
                  onClick={() =>
                    mutate(row.id, () => onSetStatus(row.id, row.status === 'published' ? 'draft' : 'published'), t.colStatus)
                  }
                >
                  {row.status === 'published' ? t.actUnpublish : t.actPublish}
                </button>
                <button className="text-kinnso-ink hover:text-kinnso-orange" onClick={() => setEditing(row)}>
                  {t.actEdit}
                </button>
                <button
                  disabled={busyId === row.id}
                  className="text-kinnso-ink hover:text-kinnso-orange"
                  onClick={() => {
                    if (window.confirm(t.deleteConfirm)) void mutate(row.id, () => onDelete(row.id), t.actDelete)
                  }}
                >
                  {t.actDelete}
                </button>
              </div>
              {rowErrors[row.id] ? <p className="mt-2 text-sm text-red-600">{rowErrors[row.id]}</p> : null}
            </TicketCard>
          ))}
        </div>
      )}
    </main>
  )
}

function TestimonialForm({
  t, roleLabel, testimonial, onSave, onDone, onCancel,
}: {
  t: T
  roleLabel: Record<TestimonialRole, string>
  testimonial: AdminTestimonial | null
  onSave: (input: TestimonialInput) => Promise<SaveResult>
  onDone: () => void
  onCancel: () => void
}) {
  const [quote, setQuote] = useState(testimonial?.quote ?? '')
  const [authorName, setAuthorName] = useState(testimonial?.author_name ?? '')
  const [authorRole, setAuthorRole] = useState<TestimonialRole>((testimonial?.author_role as TestimonialRole) ?? 'creator')
  const [locale, setLocale] = useState<string>(testimonial?.locale ?? '')
  const [sortOrder, setSortOrder] = useState<string>(String(testimonial?.sort_order ?? 0))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await onSave({
        quote,
        authorName,
        authorRole,
        locale: locale !== '' && isLocale(locale) ? locale : null,
        sortOrder: sortOrder.trim() === '' ? Number.NaN : Number(sortOrder),
      })
      if (res.ok) onDone()
      else setErrors(res.errors)
    } catch {
      setErrors({ form: ['Testimonial could not be saved'] })
    } finally {
      setSaving(false)
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-kinnso-edge bg-white px-3 py-2 font-normal'
  const err = (key: string) =>
    errors[key] ? <span className="mt-1 block text-sm font-normal text-red-600">{errors[key][0]}</span> : null

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.formQuote}
        <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={3} className={field} />
        {err('quote')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.formAuthorName}
        <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} className={field} />
        {err('authorName')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.formAuthorRole}
        <select value={authorRole} onChange={(e) => setAuthorRole(e.target.value as TestimonialRole)} className={field}>
          {TESTIMONIAL_ROLES.map((r) => (
            <option key={r} value={r}>{roleLabel[r]}</option>
          ))}
        </select>
        {err('authorRole')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.formLocale}
        <select value={locale} onChange={(e) => setLocale(e.target.value)} className={field}>
          <option value="">{t.localeAll}</option>
          {LOCALES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-kinnso-muted">{t.formLocaleHint}</span>
        {err('locale')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.formSortOrder}
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className={field}
        />
        {err('sortOrder')}
      </label>
      {errors.form ? <p className="text-sm text-red-600">{errors.form[0]}</p> : null}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white">
          {t.formSave}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-kinnso-edge px-5 py-2 font-bold text-kinnso-ink">
          {t.formCancel}
        </button>
      </div>
    </form>
  )
}
