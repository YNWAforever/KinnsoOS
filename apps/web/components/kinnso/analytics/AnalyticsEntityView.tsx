'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  hasAnalyticsConsent,
  subscribeToAnalyticsConsent,
  trackTravellerEvent,
  type TravellerAnalyticsMetadataByEvent,
} from '@/lib/analytics/client'

type AnalyticsEntityViewProps = TravellerAnalyticsMetadataByEvent['entity_viewed']

export function AnalyticsEntityView(props: AnalyticsEntityViewProps) {
  const initialProps = useRef(props)
  const tracked = useRef(false)
  const consented = useSyncExternalStore(subscribeToAnalyticsConsent, hasAnalyticsConsent, () => false)

  useEffect(() => {
    if (!consented || tracked.current) return
    tracked.current = true
    trackTravellerEvent('entity_viewed', initialProps.current)
  }, [consented])

  return null
}
