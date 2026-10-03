'use client'

import { QRCodeSVG } from 'qrcode.react'

export function OfferClaimConfirmationView({
  t, offerTitle, merchantName, rawToken,
}: {
  t: { heading: string; showAt: string }
  offerTitle: string
  merchantName: string
  rawToken: string
}) {
  return (
    <main className="flex flex-col items-center py-12">
      <h1 className="k-display">{t.heading}</h1>
      <p className="mt-2 text-kinnso-muted">{t.showAt} {merchantName}</p>
      <div className="mt-6 rounded-lg border border-kinnso-edge p-6">
        <QRCodeSVG value={rawToken} size={200} />
      </div>
      <p className="mt-4 font-bold text-kinnso-ink">{offerTitle}</p>
    </main>
  )
}
