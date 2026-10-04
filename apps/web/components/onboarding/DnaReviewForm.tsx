'use client'

import { useState } from 'react'
import { DnaSchema, type Dna } from '@kinnso/scan'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Messages } from '@/lib/i18n/messages/en'

type DnaDict = Messages['dna']

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
const joinList = (xs: string[] | undefined): string => (xs ?? []).join(', ')

export function DnaReviewForm({
  creatorId,
  draft,
  thin,
  t,
  onPublished,
}: {
  creatorId: string
  draft: Dna
  thin: boolean
  t: DnaDict
  onPublished: () => void
}) {
  const [bio, setBio] = useState(draft.bio)
  const [niches, setNiches] = useState(joinList(draft.niches))
  const [pillars, setPillars] = useState(joinList(draft.content_pillars))
  const [tone, setTone] = useState(joinList(draft.tone))
  const [geos, setGeos] = useState(joinList(draft.audience.top_geos))
  const [locales, setLocales] = useState(joinList(draft.audience.top_locales))
  const [languages, setLanguages] = useState(joinList(draft.languages))

  const [saving, setSaving] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function publish() {
    setSaving(true)
    setInvalid(false)
    setSaveError(null)

    // Rebuild the DNA. platforms[] is carried VERBATIM from the draft (read-only),
    // with verified always false (enforced by the schema literal).
    const candidate: Dna = {
      bio,
      niches: splitList(niches),
      content_pillars: splitList(pillars),
      tone: splitList(tone),
      audience: {
        top_geos: splitList(geos),
        top_locales: splitList(locales),
      },
      platforms: draft.platforms.map((p) => ({ ...p, verified: false as const })),
      languages: splitList(languages),
    }

    const parsed = DnaSchema.safeParse(candidate)
    if (!parsed.success) {
      setInvalid(true)
      setSaving(false)
      return
    }

    const supabase = createSupabaseBrowserClient()

    const { error: dnaError } = await supabase
      .from('creator_dna')
      .update({ final: parsed.data, status: 'published' })
      .eq('creator_id', creatorId)
    if (dnaError) {
      setSaveError(dnaError.message)
      setSaving(false)
      return
    }

    const { error: creatorError } = await supabase
      .from('creators')
      .update({ status: 'active' })
      .eq('id', creatorId)
    if (creatorError) {
      setSaveError(creatorError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onPublished()
  }

  return (
    <section className="w-full max-w-lg space-y-4">
      <h2 className="text-xl font-semibold">{t.reviewHeading}</h2>
      <p className="text-sm text-kinnso-ink/70">{t.reviewIntro}</p>
      {thin ? <p className="rounded bg-amber-50 p-2 text-sm text-amber-700">{t.thinNotice}</p> : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t.bio}</span>
        <textarea
          aria-label={t.bio}
          className="w-full rounded border px-2 py-1"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </label>

      <ListField label={t.niches} hint={t.listHint} value={niches} onChange={setNiches} />
      <ListField label={t.contentPillars} hint={t.listHint} value={pillars} onChange={setPillars} />
      <ListField label={t.tone} hint={t.listHint} value={tone} onChange={setTone} />
      <ListField label={t.topGeos} hint={t.listHint} value={geos} onChange={setGeos} />
      <ListField label={t.topLocales} hint={t.listHint} value={locales} onChange={setLocales} />
      <ListField label={t.languages} hint={t.listHint} value={languages} onChange={setLanguages} />

      <div className="space-y-1">
        <span className="text-sm font-medium">{t.platforms}</span>
        <ul className="space-y-1">
          {draft.platforms.map((p) => (
            <li key={p.platform} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
              <span>
                {p.platform}
                {typeof p.followers === 'number' ? ` · ${p.followers}` : ''}
              </span>
              <span className="rounded bg-kinnso-ink/10 px-2 py-0.5 text-xs">{t.unverified}</span>
            </li>
          ))}
        </ul>
      </div>

      {invalid ? <p className="text-sm text-red-600">{t.invalid}</p> : null}
      {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}

      <button
        type="button"
        className="rounded bg-kinnso-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        onClick={publish}
        disabled={saving}
      >
        {saving ? t.saving : t.publish}
      </button>
    </section>
  )
}

function ListField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        aria-label={label}
        className="w-full rounded border px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-xs text-kinnso-ink/50">{hint}</span>
    </label>
  )
}
