'use client'

import { useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  PLATFORMS,
  type Platform,
  validateHandle,
  handleUrl,
} from '@/lib/onboarding/validateHandle'
import type { Messages } from '@/lib/i18n/messages/en'

type HandlesDict = Messages['onboarding']['handlesStep']

export interface InitialHandle {
  platform: Platform
  handle: string
}

interface Row {
  key: number
  platform: Platform
  raw: string
}

interface ResolvedRow {
  row: Row
  /** validation outcome */
  result: ReturnType<typeof validateHandle>
  /** true when an earlier row already used this platform */
  duplicate: boolean
}

function errorKey(result: ReturnType<typeof validateHandle>, t: HandlesDict): string | null {
  if (result.ok) return null
  switch (result.error) {
    case 'empty':
      return null // empty rows are not surfaced as errors (user is still typing / can remove)
    case 'format':
    case 'platform':
      return t.errorFormat
    case 'length':
      return t.errorLength
  }
}

export function HandlesStep({
  creatorId,
  initialHandles,
  t,
  onRun,
}: {
  creatorId: string
  initialHandles: InitialHandle[]
  t: HandlesDict
  onRun: () => void
}) {
  let nextKey = 0
  const seed: Row[] =
    initialHandles.length > 0
      ? initialHandles.map((h) => ({ key: nextKey++, platform: h.platform, raw: h.handle }))
      : [{ key: nextKey++, platform: 'instagram', raw: '' }]

  const [rows, setRows] = useState<Row[]>(seed)
  const [keyCounter, setKeyCounter] = useState(seed.length)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const resolved: ResolvedRow[] = useMemo(() => {
    const seen = new Set<Platform>()
    return rows.map((row) => {
      const result = validateHandle(row.platform, row.raw)
      const duplicate = seen.has(row.platform)
      if (result.ok) seen.add(row.platform)
      return { row, result, duplicate }
    })
  }, [rows])

  const validRows = resolved.filter((r) => r.result.ok && !r.duplicate)
  const hasDuplicate = resolved.some((r) => r.duplicate)
  const canRun = validRows.length >= 1 && !hasDuplicate && !saving

  function updateRow(key: number, patch: Partial<Pick<Row, 'platform' | 'raw'>>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, { key: keyCounter, platform: 'instagram', raw: '' }])
    setKeyCounter((k) => k + 1)
  }
  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev))
  }

  async function run() {
    setSaving(true)
    setSaveError(null)
    const supabase = createSupabaseBrowserClient()

    const keepPlatforms = validRows.map((r) => r.row.platform)
    const payload = validRows.map((r) => ({
      creator_id: creatorId,
      platform: r.row.platform,
      handle: (r.result as { ok: true; value: string }).value,
      url: handleUrl(r.row.platform, (r.result as { ok: true; value: string }).value),
    }))

    // Remove any previously-saved platform the user dropped, then upsert the rest.
    const dropped = PLATFORMS.filter((p) => !keepPlatforms.includes(p))
    if (dropped.length > 0) {
      const { error } = await supabase
        .from('creator_social_handles')
        .delete()
        .in('platform', dropped as string[])
      if (error) {
        setSaveError(error.message)
        setSaving(false)
        return
      }
    }
    const { error } = await supabase
      .from('creator_social_handles')
      .upsert(payload, { onConflict: 'creator_id,platform' })
    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }
    setSaving(false)
    onRun()
  }

  return (
    <section className="w-full max-w-md space-y-4">
      <h2 className="text-xl font-semibold">{t.heading}</h2>
      <p className="text-sm text-kinnso-ink/70">{t.intro}</p>

      <ul className="space-y-3">
        {resolved.map(({ row, result, duplicate }) => {
          const fmtError = errorKey(result, t)
          const dupError = duplicate ? t.errorDuplicate : null
          return (
            <li key={row.key} className="space-y-1">
              <div className="flex gap-2">
                <select
                  aria-label="platform"
                  className="rounded border px-2 py-1"
                  value={row.platform}
                  onChange={(e) => updateRow(row.key, { platform: e.target.value as Platform })}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {t[p]}
                    </option>
                  ))}
                </select>
                <input
                  className="flex-1 rounded border px-2 py-1"
                  placeholder={t.placeholder}
                  value={row.raw}
                  onChange={(e) => updateRow(row.key, { raw: e.target.value })}
                  onKeyDown={(e) => {
                    // Pressing Enter in a handle field is the natural way to submit;
                    // without this it does nothing (no enclosing <form>), which reads
                    // as "no response after typing". Only fire when a run is allowed.
                    if (e.key === 'Enter' && canRun) {
                      e.preventDefault()
                      void run()
                    }
                  }}
                />
                <button
                  type="button"
                  className="text-sm underline text-kinnso-ink/60"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length <= 1}
                >
                  {t.remove}
                </button>
              </div>
              {dupError ? (
                <p className="text-xs text-red-600">{dupError}</p>
              ) : fmtError ? (
                <p className="text-xs text-red-600">{fmtError}</p>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-sm underline"
          onClick={addRow}
          disabled={rows.length >= PLATFORMS.length}
        >
          {t.add}
        </button>
        <button
          type="button"
          className="rounded bg-kinnso-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          onClick={run}
          disabled={!canRun}
        >
          {t.run}
        </button>
      </div>

      {!canRun && validRows.length === 0 ? (
        <p className="text-xs text-kinnso-ink/50">{t.needOne}</p>
      ) : null}
      {saveError ? <p className="text-xs text-red-600">{saveError}</p> : null}
    </section>
  )
}
