'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SESSION_TYPES, type SessionInput, type SessionType } from '@/lib/sessions/types'
import type { ValidationErrors } from '@/lib/sessions/validation'
import type { Messages } from '@/lib/i18n/messages/en'

type SaveResult = { ok: true; id: string; slug?: string } | { ok: false; errors: ValidationErrors }

/** Field labels the form itself renders. Both `studioSessions` and `sessionsAdmin`
 *  message groups satisfy this — they don't share a common parent type, so this
 *  is the narrow shape SessionForm actually depends on rather than the full
 *  Messages['studioSessions'] (which the ops caller's `sessionsAdmin` messages
 *  aren't structurally assignable to). */
export type SessionFormMessages = Pick<
  Messages['studioSessions'],
  | 'titleLabel' | 'descriptionLabel' | 'typeLabel'
  | 'startsAtLabel' | 'durationLabel'
  | 'embedUrlLabel' | 'embedUrlPlaceholder'
  | 'replayUrlLabel' | 'replayUrlPlaceholder'
  | 'destinationTagsLabel' | 'destinationTagsPlaceholder'
  | 'saveButton'
  | 'hostPickerLabel' | 'hostPickerPlaceholder' | 'hostRequiredError'
>

/** Shared by the Studio (creator) and ops create/edit pages — the caller supplies
 *  which server action to call and where to navigate on success. */
export function SessionForm({
  t, typeLabel, initial, onSave, onDoneHref,
  hostPicker,
}: {
  t: SessionFormMessages
  typeLabel: Record<SessionType, string>
  initial: Partial<SessionInput> | null
  onSave: (input: SessionInput) => Promise<SaveResult>
  onDoneHref: string
  hostPicker?: {
    creators: { id: string; handle: string | null; displayName: string | null }[]
    value: string
    onChange: (id: string) => void
  }
}) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [type, setType] = useState<SessionType>((initial?.type as SessionType) ?? 'ask_a_creator')
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? '')
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes ?? '')
  const [embedUrl, setEmbedUrl] = useState(initial?.embedUrl ?? '')
  const [replayUrl, setReplayUrl] = useState(initial?.replayUrl ?? '')
  const [destinationTags, setDestinationTags] = useState(initial?.destinationTags ?? '')
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (hostPicker && !hostPicker.value) {
      setErrors({ host: [t.hostRequiredError] })
      return
    }
    setSaving(true)
    try {
      const result = await onSave({ title, description, type, startsAt, durationMinutes, embedUrl, replayUrl, destinationTags })
      if (result.ok) router.push(onDoneHref)
      else setErrors(result.errors)
    } finally {
      setSaving(false)
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-kinnso-edge bg-white px-3 py-2 font-normal'
  const err = (key: string) => (errors[key] ? <span className="mt-1 block text-sm font-normal text-red-600">{errors[key][0]}</span> : null)

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.titleLabel}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        {err('title')}
      </label>
      {hostPicker ? (
        <label className="block text-sm font-bold text-kinnso-ink">
          {t.hostPickerLabel}
          <select value={hostPicker.value} onChange={(e) => hostPicker.onChange(e.target.value)} className={field}>
            <option value="">{t.hostPickerPlaceholder}</option>
            {hostPicker.creators.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName ?? c.handle ?? c.id}</option>
            ))}
          </select>
          {err('host')}
        </label>
      ) : null}
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.descriptionLabel}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={field} />
        {err('description')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.typeLabel}
        <select value={type} onChange={(e) => setType(e.target.value as SessionType)} className={field}>
          {SESSION_TYPES.map((st) => <option key={st} value={st}>{typeLabel[st]}</option>)}
        </select>
        {err('type')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.startsAtLabel}
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} />
        {err('startsAt')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.durationLabel}
        <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={field} />
        {err('durationMinutes')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.embedUrlLabel}
        <input value={embedUrl} onChange={(e) => setEmbedUrl(e.target.value)} placeholder={t.embedUrlPlaceholder} className={field} />
        {err('embedUrl')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.replayUrlLabel}
        <input value={replayUrl} onChange={(e) => setReplayUrl(e.target.value)} placeholder={t.replayUrlPlaceholder} className={field} />
        {err('replayUrl')}
      </label>
      <label className="block text-sm font-bold text-kinnso-ink">
        {t.destinationTagsLabel}
        <input value={destinationTags} onChange={(e) => setDestinationTags(e.target.value)} placeholder={t.destinationTagsPlaceholder} className={field} />
      </label>
      {errors.form ? <p className="text-sm text-red-600">{errors.form[0]}</p> : null}
      <button type="submit" disabled={saving} className="k-btn-primary">{t.saveButton}</button>
    </form>
  )
}

export default SessionForm
