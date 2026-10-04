'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import type { RedeemResult } from '@/lib/offers/redeem-actions'

type RedeemAction = (rawToken: string, amountSpent: number | null) =>
  Promise<{ ok: true } & RedeemResult | { ok: false; errors: Record<string, string[]> }>

export function MerchantRedeemView({ t, onRedeem }: {
  t: {
    title: string; scanning: string; manualPlaceholder: string; manualSubmit: string
    amountSpentPrompt: string; amountSpentSubmit: string; success: string; alreadyRedeemed: string
  }
  onRedeem: RedeemAction
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [manualCode, setManualCode] = useState('')
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [amountSpent, setAmountSpent] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let frameId: number

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        scanFrame()
      } catch {
        // Camera unavailable or denied -- manual entry below still works.
      }
    }

    function scanFrame() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code?.data) {
            setPendingToken(code.data)
            return
          }
        }
      }
      frameId = requestAnimationFrame(scanFrame)
    }

    startCamera()
    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  async function redeem(token: string, spent: number | null) {
    setError(null)
    const result = await onRedeem(token, spent)
    if (!result.ok) {
      setError(result.errors.form[0])
      setPendingToken(null)
      return
    }
    setMessage(result.alreadyRedeemed ? t.alreadyRedeemed : t.success)
    setPendingToken(null)
    setManualCode('')
    setAmountSpent('')
  }

  return (
    <main>
      <h1 className="k-display">{t.title}</h1>

      <div className="mt-4">
        <video ref={videoRef} muted playsInline className="w-full max-w-sm rounded-lg bg-black" />
        <canvas ref={canvasRef} className="hidden" />
        <p className="mt-1 text-sm text-kinnso-muted">{t.scanning}</p>
      </div>

      <div className="mt-4 max-w-sm">
        <input
          className="w-full rounded border border-kinnso-edge p-2"
          placeholder={t.manualPlaceholder}
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
        />
        <button
          className="mt-2 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white"
          onClick={() => setPendingToken(manualCode)}
        >
          {t.manualSubmit}
        </button>
      </div>

      {pendingToken ? (
        <div className="mt-4 max-w-sm rounded-lg border border-kinnso-edge p-4">
          <p>{t.amountSpentPrompt}</p>
          <input
            className="mt-2 w-full rounded border border-kinnso-edge p-2"
            placeholder="0.00"
            value={amountSpent}
            onChange={(e) => setAmountSpent(e.target.value)}
          />
          <button
            className="mt-2 rounded-full bg-kinnso-orange px-4 py-2 text-sm font-bold text-white"
            onClick={() => {
              const trimmed = amountSpent.trim()
              if (trimmed !== '' && Number.isNaN(Number(trimmed))) {
                setError('Enter a valid number')
                return
              }
              redeem(pendingToken, trimmed === '' ? null : Number(trimmed))
            }}
          >
            {t.amountSpentSubmit}
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-4 font-bold text-kinnso-ink">{message}</p> : null}
      {error ? <p className="mt-4 text-red-600">{error}</p> : null}
    </main>
  )
}
