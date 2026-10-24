import {ensureAnalyticsJourney} from './client'
import type {Locale} from '@/lib/i18n/config'
import {trackPilotEvent} from '../../../journeys/lib/telemetry/pilot-client'
export function trackWebPilotEvent(value:Parameters<typeof trackPilotEvent>[0],locale:Locale='en'):boolean{
 if(!ensureAnalyticsJourney(locale))return false
 void trackPilotEvent(value,'/api/pilot')
 return true
}
