'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LiveProgress } from '@/components/onboarding/LiveProgress'
import type { Platform } from '@/lib/onboarding/validateHandle'
import type { Messages } from '@/lib/i18n/messages/en'

/** Idle Rescan button that expands into the shared LiveProgress scan UI. */
export function StudioRescanButton({
  creatorId,
  platforms,
  activeJobId,
  progressT,
  t,
}: {
  creatorId: string
  platforms: Platform[]
  activeJobId: string | null
  progressT: Messages['onboarding']['progressStep']
  t: Messages['studioDashboard']
}) {
  const router = useRouter()
  const [scanning, setScanning] = useState(activeJobId !== null)

  if (!scanning) {
    return (
      <button type="button" className="text-sm font-bold text-kinnso-orange" onClick={() => setScanning(true)}>
        {t.rescanCta}
      </button>
    )
  }

  return (
    <LiveProgress
      creatorId={creatorId}
      jobId={activeJobId}
      platforms={platforms}
      t={progressT}
      onReady={() => router.refresh()}
    />
  )
}

export default StudioRescanButton
