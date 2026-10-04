'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { validateHandle, handleUrl, type Platform } from '@/lib/onboarding/validateHandle'
import type { Messages } from '@/lib/i18n/messages/en'

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  threads: 'Threads',
}

type T = Messages['studioDashboard']

/** Inline island: add one missing social handle, then refresh server data. */
export function AddHandleDialog({
  creatorId,
  missing,
  t,
}: {
  creatorId: string
  missing: Platform[]
  t: T
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState<Platform>(missing[0] ?? 'instagram')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  if (missing.length === 0) return null

  function errorText(code: 'empty' | 'format' | 'length' | 'platform'): string {
    if (code === 'format') return t.addHandleErrorFormat
    if (code === 'length') return t.addHandleErrorLength
    return t.addHandleErrorEmpty
  }

  async function save() {
    setError(null)
    const result = validateHandle(platform, value)
    if (!result.ok) {
      setError(errorText(result.error))
      return
    }
    setSaving(true)
    const supabase = createSupabaseBrowserClient()
    const { error: upsertError } = await supabase
      .from('creator_social_handles')
      .upsert(
        [{ creator_id: creatorId, platform, handle: result.value, url: handleUrl(platform, result.value) }],
        { onConflict: 'creator_id,platform' },
      )
    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    setSaved(true)
    router.refresh()
  }

  if (!open) {
    return (
      <button type="button" className="text-sm font-bold text-kinnso-orange" onClick={() => setOpen(true)}>
        {t.itemConnectCta}
      </button>
    )
  }

  return (
    <div className="mt-2 w-full rounded-xl border border-kinnso-orange/30 bg-kinnso-cream p-3">
      <p className="text-sm font-bold text-kinnso-ink">{t.addHandleTitle}</p>
      {saved ? (
        <p className="mt-2 text-sm text-green-700">{t.addHandleSaved}</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label={t.addHandleTitle}
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="rounded-lg border border-kinnso-muted/30 bg-white px-2 py-1.5 text-sm"
            >
              {missing.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
              ))}
            </select>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t.addHandlePlaceholder}
              className="min-w-0 flex-1 rounded-lg border border-kinnso-muted/30 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={saving} onClick={save} className="k-btn-primary px-3 py-1.5 text-sm disabled:opacity-60">
              {t.addHandleSave}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-kinnso-muted">
              {t.addHandleCancel}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default AddHandleDialog
