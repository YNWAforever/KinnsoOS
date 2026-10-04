'use client'

import type { Messages } from '@/lib/i18n/dictionaries'

import { useState, useTransition } from 'react'
import { summarizeOffers } from '@/lib/merchants/offers-queries'
import type { MerchantOfferRow } from '@/lib/merchants/offers-queries'
import type { OfferInput } from '@/lib/merchants/offers-validation'

type CreateOffer = (input: OfferInput) => Promise<{ ok: boolean; errors?: Record<string, string[]> }>
type SetStatus = (offerId: string, status: 'live' | 'paused' | 'ended') => Promise<{ ok: boolean }>

const emptyInput: OfferInput = {
  title: '', terms: '', discountKind: 'item', discountValue: '',
  commissionKind: 'flat', commissionValue: '',
  validFrom: '', validTo: '', perVisitorLimit: '1', totalCap: '', missionId: null,
}

export function MerchantOffersView({
  t, offers, onCreate, onSetStatus,
}: {
  t: Messages['merchantOffers']
  offers: MerchantOfferRow[]
  onCreate: CreateOffer
  onSetStatus: SetStatus
}) {
  const [input, setInput] = useState<OfferInput>(emptyInput)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setFormError(null)
    startTransition(async () => {
      const result = await onCreate(input)
      if (!result.ok) {
        setFormError(result.errors?.form?.[0] ?? 'Could not create offer')
        return
      }
      setInput(emptyInput)
    })
  }

  const summary = summarizeOffers(offers)

  return (
    <main>
      <h1 className="k-display">{t.title}</h1>
      <p className="mt-1 text-kinnso-muted">
        {summary.totalClaimed} {t.totalClaimed} · {summary.totalRedeemed} {t.totalRedeemed}
      </p>
      <section className="mt-6 max-w-lg">
        <input className="w-full rounded border border-kinnso-edge p-2" placeholder={t.fieldTitle}
          value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} />
        <input className="mt-2 w-full rounded border border-kinnso-edge p-2" placeholder={t.fieldTerms}
          value={input.terms} onChange={(e) => setInput({ ...input, terms: e.target.value })} />
        <div className="mt-2 flex gap-2">
          <select className="rounded border border-kinnso-edge p-2" value={input.discountKind}
            onChange={(e) => setInput({ ...input, discountKind: e.target.value as OfferInput['discountKind'] })}>
            <option value="item">{t.discountItem}</option>
            <option value="percent">{t.discountPercent}</option>
            <option value="amount">{t.discountAmount}</option>
          </select>
          <input className="w-24 rounded border border-kinnso-edge p-2" placeholder={t.fieldValue}
            value={input.discountValue} onChange={(e) => setInput({ ...input, discountValue: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <select className="rounded border border-kinnso-edge p-2" value={input.commissionKind}
            onChange={(e) => setInput({ ...input, commissionKind: e.target.value as OfferInput['commissionKind'] })}>
            <option value="flat">{t.commissionFlat}</option>
            <option value="percent">{t.commissionPercent}</option>
          </select>
          <input className="w-24 rounded border border-kinnso-edge p-2" placeholder={t.fieldValue}
            value={input.commissionValue} onChange={(e) => setInput({ ...input, commissionValue: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <input type="datetime-local" className="rounded border border-kinnso-edge p-2"
            value={input.validFrom} onChange={(e) => setInput({ ...input, validFrom: e.target.value })} />
          <input type="datetime-local" className="rounded border border-kinnso-edge p-2"
            value={input.validTo} onChange={(e) => setInput({ ...input, validTo: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <input className="w-32 rounded border border-kinnso-edge p-2" placeholder={t.fieldPerVisitorLimit}
            value={input.perVisitorLimit} onChange={(e) => setInput({ ...input, perVisitorLimit: e.target.value })} />
          <input className="w-32 rounded border border-kinnso-edge p-2" placeholder={t.fieldTotalCap}
            value={input.totalCap} onChange={(e) => setInput({ ...input, totalCap: e.target.value })} />
        </div>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        <button disabled={isPending} onClick={submit}
          className="mt-3 rounded-full bg-kinnso-orange px-5 py-2 font-bold text-white disabled:opacity-50">
          {t.publish}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-kinnso-ink">{t.yourOffers}</h2>
        <div className="mt-3 grid gap-3">
          {offers.map((offer) => (
            <div key={offer.id} className="rounded-lg border border-kinnso-edge p-4">
              <p className="font-bold text-kinnso-ink">{offer.title}</p>
              <p className="text-sm text-kinnso-muted">{offer.status} · {offer.claimedCount} {t.claimed} · {offer.redeemedCount} {t.redeemed}</p>
              <div className="mt-2 flex gap-2 text-sm">
                {offer.status !== 'live' ? (
                  <button onClick={() => startTransition(async () => { await onSetStatus(offer.id, 'live') })} className="text-kinnso-orange">{t.actPublish}</button>
                ) : null}
                {offer.status === 'live' ? (
                  <button onClick={() => startTransition(async () => { await onSetStatus(offer.id, 'paused') })} className="text-kinnso-ink">{t.actPause}</button>
                ) : null}
                <button onClick={() => startTransition(async () => { await onSetStatus(offer.id, 'ended') })} className="text-red-600">{t.actEnd}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
