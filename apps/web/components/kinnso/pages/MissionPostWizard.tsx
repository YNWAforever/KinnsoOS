'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import type { Messages } from '@/lib/i18n/messages/en'
import type { GatedTier } from '@/lib/contribution/tiers'
import type {
  MissionDraftInput,
  MissionEffort,
  MissionType,
  MissionVisibility,
} from '@/lib/missions/types'
import { validateMissionDraft } from '@/lib/missions/validation'

interface Props {
  locale: string
  t: Messages['missions']
  onSubmit: (input: MissionDraftInput, opts: { publish: boolean }) => SubmitResult | Promise<SubmitResult>
}

type SubmitResult =
  | void
  | { ok: true; missionId?: string }
  | {
      ok: false
      errors?: Record<string, string[]>
    }

const fieldShell = 'grid gap-1 text-sm font-semibold text-kinnso-ink'
const inputShell =
  'rounded-lg bg-white px-3 py-2 text-sm font-medium text-kinnso-ink ring-1 ring-kinnso-cream2 focus:outline-none focus:ring-2 focus:ring-kinnso-orange'

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value))
const textOrNull = (value: string) => {
  const next = value.trim()
  return next === '' ? null : next
}

const linesToArray = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const isFailureResult = (result: SubmitResult): result is Extract<SubmitResult, { ok: false }> =>
  typeof result === 'object' && result !== null && 'ok' in result && result.ok === false

const firstActionError = (errors: Record<string, string[]> | undefined) =>
  Object.values(errors ?? {})
    .flat()
    .find((message) => message.trim().length > 0)

export function MissionPostWizard({ locale, t, onSubmit }: Props) {
  const [missionType, setMissionType] = useState<MissionType>('coupon_affiliate')
  const [visibility, setVisibility] = useState<MissionVisibility>('open')
  const [minTier, setMinTier] = useState<'open' | GatedTier>('open')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponUrl, setCouponUrl] = useState('')
  const [affiliateCommissionRate, setAffiliateCommissionRate] = useState('10')
  const [kinnsoCommissionRate, setKinnsoCommissionRate] = useState('4')
  const [creatorCommissionRate, setCreatorCommissionRate] = useState('6')
  const [paidFeeAmount, setPaidFeeAmount] = useState('')
  const [paidFeeCurrency, setPaidFeeCurrency] = useState('HKD')
  const [maxReceiptsPerCreator, setMaxReceiptsPerCreator] = useState('')
  const [milestoneTitle, setMilestoneTitle] = useState('')
  const [milestoneDescription, setMilestoneDescription] = useState('')
  const [deliverables, setDeliverables] = useState('')
  const [requirements, setRequirements] = useState('')
  const [dos, setDos] = useState('')
  const [donts, setDonts] = useState('')
  const [keyMessages, setKeyMessages] = useState('')
  const [referenceLinks, setReferenceLinks] = useState('')
  const [effort, setEffort] = useState<'' | MissionEffort>('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [missionId, setMissionId] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const includesCoupon = missionType === 'coupon_affiliate' || missionType === 'hybrid'
  const includesPaid = missionType === 'paid' || missionType === 'hybrid'
  const isReceiptCashback = missionType === 'receipt_cashback'
  const includesFeeAmount = includesPaid || isReceiptCashback

  const buildInput = (): MissionDraftInput => ({
    missionSource: 'merchant',
    missionType,
    visibility,
    title,
    summary,
    couponCode: includesCoupon ? textOrNull(couponCode) : null,
    couponUrl: includesCoupon ? textOrNull(couponUrl) : null,
    affiliateCommissionRate: includesCoupon ? numberOrNull(affiliateCommissionRate) : null,
    kinnsoCommissionRate: includesCoupon ? numberOrNull(kinnsoCommissionRate) : null,
    creatorCommissionRate: includesCoupon ? numberOrNull(creatorCommissionRate) : null,
    paidFeeAmount: includesFeeAmount ? numberOrNull(paidFeeAmount) : null,
    paidFeeCurrency: includesFeeAmount ? textOrNull(paidFeeCurrency) : null,
    affiliateNetworkProgramId: null,
    minTier: minTier === 'open' ? null : minTier,
    maxReceiptsPerCreator: isReceiptCashback ? numberOrNull(maxReceiptsPerCreator) : null,
    // receipt_cashback missions get their single repeatable milestone auto-created by a DB
    // trigger at mission-insert time, so no milestone is collected here for that type.
    milestones: includesPaid && milestoneTitle.trim() !== ''
      ? [{ title: milestoneTitle, description: milestoneDescription.trim() || milestoneTitle }]
      : [],
    deliverables: linesToArray(deliverables),
    requirements: linesToArray(requirements),
    dos: linesToArray(dos),
    donts: linesToArray(donts),
    keyMessages: linesToArray(keyMessages),
    referenceLinks: linesToArray(referenceLinks),
    effort: effort === '' ? null : effort,
  })

  const submit = async (publish: boolean) => {
    if (submitted) return
    if (submittingRef.current) return
    const input = buildInput()
    const validation = validateMissionDraft(input)
    if (!validation.ok) {
      setError(t.validationError)
      return
    }

    setError('')
    submittingRef.current = true
    setSubmitting(true)
    try {
      const result = await onSubmit(input, { publish })
      if (isFailureResult(result)) {
        setError(firstActionError(result.errors) ?? t.validationError)
        return
      }
      if (result && typeof result === 'object' && 'missionId' in result && result.missionId) {
        setMissionId(result.missionId)
      }
      setSubmitted(true)
    } catch {
      setError(t.validationError)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="k-container py-10" lang={locale}>
        <div className="rounded-2xl border border-kinnso-cream2 bg-white p-8 shadow-kinnso">
          <h1 className="text-2xl font-black text-kinnso-ink">{t.postSuccessTitle}</h1>
          <p className="mt-2 text-kinnso-muted">{t.postSuccessBody}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {missionId && (
              <Link href={`/${locale}/merchants/dashboard/missions/${missionId}`} className="k-btn-primary">
                {t.viewMission}
              </Link>
            )}
            <Link href={`/${locale}/merchants/dashboard/missions`} className="k-btn-ghost">
              {t.backToQueue}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="k-container py-10" lang={locale}>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-black text-kinnso-ink">{t.postHeading}</h1>
        <p className="mt-1 text-sm text-kinnso-muted">{t.postSub}</p>
      </div>

      <form className="k-ticket mt-8 grid max-w-3xl gap-6 p-6" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="grid gap-3">
          <legend className="sr-only">{t.postHeading}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ['coupon_affiliate', t.typeCoupon],
              ['hybrid', t.typeHybrid],
              ['paid', t.typePaid],
              ['receipt_cashback', t.typeReceiptCashback],
            ].map(([value, label]) => (
              <label
                key={value}
                className={missionType === value ? 'k-btn-primary cursor-pointer' : 'k-btn-ghost cursor-pointer'}
              >
                <input
                  type="radio"
                  name="missionType"
                  value={value}
                  checked={missionType === value}
                  onChange={() => setMissionType(value as MissionType)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className={fieldShell}>
          {t.title}
          <input className={inputShell} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className={fieldShell}>
          {t.summary}
          <textarea
            className={`${inputShell} min-h-24 resize-y`}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>

        <fieldset className="grid gap-3">
          <legend className="sr-only">{t.openMission}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ['open', t.openMission],
              ['targeted', t.targetedMission],
            ].map(([value, label]) => (
              <label
                key={value}
                className={visibility === value ? 'k-btn-primary cursor-pointer' : 'k-btn-ghost cursor-pointer'}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value as MissionVisibility)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-kinnso-ink">{t.minTierLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ['open', t.minTierOpen],
              ['rising', t.minTierRising],
              ['pro', t.minTierPro],
              ['elite', t.minTierElite],
            ].map(([value, label]) => (
              <label
                key={value}
                className={minTier === value ? 'k-btn-primary cursor-pointer' : 'k-btn-ghost cursor-pointer'}
              >
                <input
                  type="radio"
                  name="minTier"
                  value={value}
                  checked={minTier === value}
                  onChange={() => setMinTier(value as 'open' | GatedTier)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 rounded-lg bg-kinnso-cream px-4 py-4">
          <legend className="text-sm font-semibold text-kinnso-ink">{t.briefDetailsHeading}</legend>
          <p className="text-xs text-kinnso-muted">{t.briefListHint}</p>
          <label className={fieldShell}>
            {t.deliverablesLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={deliverables}
              onChange={(event) => setDeliverables(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.requirementsLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.dosLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={dos}
              onChange={(event) => setDos(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.dontsLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={donts}
              onChange={(event) => setDonts(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.keyMessagesLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={keyMessages}
              onChange={(event) => setKeyMessages(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.referenceLinksLabel}
            <textarea
              className={`${inputShell} min-h-20 resize-y`}
              value={referenceLinks}
              onChange={(event) => setReferenceLinks(event.target.value)}
            />
          </label>
          <label className={fieldShell}>
            {t.effortLabel}
            <select
              className={inputShell}
              value={effort}
              onChange={(event) => setEffort(event.target.value as '' | MissionEffort)}
            >
              <option value="">{t.effortUnset}</option>
              <option value="low">{t.effortLow}</option>
              <option value="medium">{t.effortMedium}</option>
              <option value="high">{t.effortHigh}</option>
            </select>
          </label>
        </fieldset>

        {includesCoupon && (
          <section className="grid gap-3 rounded-lg bg-kinnso-cream px-4 py-4 sm:grid-cols-2">
            <label className={fieldShell}>
              {t.couponCode}
              <input className={inputShell} value={couponCode} onChange={(event) => setCouponCode(event.target.value)} />
            </label>
            <label className={fieldShell}>
              {t.couponUrl}
              <input className={inputShell} value={couponUrl} onChange={(event) => setCouponUrl(event.target.value)} />
            </label>
            <label className={fieldShell}>
              {t.affiliateCommissionRate}
              <input
                className={inputShell}
                inputMode="decimal"
                value={affiliateCommissionRate}
                onChange={(event) => setAffiliateCommissionRate(event.target.value)}
              />
            </label>
            <label className={fieldShell}>
              {t.kinnsoCommissionRate}
              <input
                className={inputShell}
                inputMode="decimal"
                value={kinnsoCommissionRate}
                onChange={(event) => setKinnsoCommissionRate(event.target.value)}
              />
            </label>
            <label className={fieldShell}>
              {t.creatorCommissionRate}
              <input
                className={inputShell}
                inputMode="decimal"
                value={creatorCommissionRate}
                onChange={(event) => setCreatorCommissionRate(event.target.value)}
              />
            </label>
          </section>
        )}

        {includesFeeAmount && (
          <section className="grid gap-3 rounded-lg bg-kinnso-cream px-4 py-4 sm:grid-cols-2">
            <label className={fieldShell}>
              {isReceiptCashback ? t.receiptCashbackAmount : t.paidFeeAmount}
              <input
                className={inputShell}
                inputMode="decimal"
                value={paidFeeAmount}
                onChange={(event) => setPaidFeeAmount(event.target.value)}
              />
            </label>
            <label className={fieldShell}>
              {t.paidFeeCurrency}
              <input className={inputShell} value={paidFeeCurrency} onChange={(event) => setPaidFeeCurrency(event.target.value)} />
            </label>
            {includesPaid && (
              <>
                <label className={fieldShell}>
                  {t.milestoneTitle}
                  <input className={inputShell} value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} />
                </label>
                <label className={fieldShell}>
                  {t.milestoneDescription}
                  <input className={inputShell} value={milestoneDescription} onChange={(event) => setMilestoneDescription(event.target.value)} />
                </label>
              </>
            )}
            {isReceiptCashback && (
              <label className={fieldShell}>
                {t.maxReceiptsPerCreator}
                <input
                  className={inputShell}
                  inputMode="numeric"
                  value={maxReceiptsPerCreator}
                  onChange={(event) => setMaxReceiptsPerCreator(event.target.value)}
                />
              </label>
            )}
          </section>
        )}

        {error && <p className="text-sm font-semibold text-kinnso-red" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="k-btn-ghost disabled:opacity-50" disabled={submitting || submitted} onClick={() => void submit(false)}>{t.saveDraft}</button>
          <button type="button" className="k-btn-primary disabled:opacity-50" disabled={submitting || submitted} onClick={() => void submit(true)}>{t.publish}</button>
        </div>
      </form>
    </div>
  )
}
