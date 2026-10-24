// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {cleanup,render,waitFor,fireEvent,screen} from '@testing-library/react'
import {grantAnalyticsConsent,revokeAnalyticsConsent} from '@/lib/analytics/client'
import {GuidePlanningActions} from '@/components/kinnso/pilot/GuidePlanningActions'
import {PilotExperienceArrival} from '@/components/kinnso/pilot/PilotExperienceArrival'
const guide='11111111-1111-4111-8111-111111111111',experience='22222222-2222-4222-8222-222222222222'
const pilotCalls=()=>vi.mocked(fetch).mock.calls.filter(([url])=>url==='/api/pilot')
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear()
 vi.stubEnv('NEXT_PUBLIC_ANALYTICS_MODE','production')
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:202})))
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('records exactly one qualifying guide view after normal banner consent, without navigation or a manufactured cookie',async()=>{
 render(<GuidePlanningActions guideId={guide} href="https://planner.example/en/g/11111111-1111-4111-8111-111111111111?adopt=1" label="Plan" unavailable="Unavailable"/>)
 expect(pilotCalls()).toHaveLength(0)
 expect(grantAnalyticsConsent('en')).toBe(true)
 await waitFor(()=>expect(pilotCalls()).toHaveLength(1))
 expect(JSON.parse(pilotCalls()[0][1]!.body as string)).toMatchObject({phase:'guide_viewed',guideId:guide})
 revokeAnalyticsConsent();grantAnalyticsConsent('en')
 await new Promise(resolve=>setTimeout(resolve,0));expect(pilotCalls()).toHaveLength(1)
})
it('records a delivered experience after consent is accepted on that page',async()=>{
 render(<PilotExperienceArrival guideId={guide} experienceId={experience}/>)
 grantAnalyticsConsent('en')
 await waitFor(()=>expect(pilotCalls()).toHaveLength(1))
 expect(JSON.parse(pilotCalls()[0][1]!.body as string).phase).toBe('experience_referral')
})
it('disabled public analytics blocks pilot transport despite old accepted storage',async()=>{
 grantAnalyticsConsent('en');vi.mocked(fetch).mockClear();vi.stubEnv('NEXT_PUBLIC_ANALYTICS_MODE','disabled')
 render(<GuidePlanningActions guideId={guide} href="https://planner.example/en/g/11111111-1111-4111-8111-111111111111?adopt=1" label="Plan" unavailable="Unavailable"/>)
 fireEvent.click(screen.getByRole('link',{name:'Plan'}))
 await new Promise(resolve=>setTimeout(resolve,0))
 expect(pilotCalls()).toHaveLength(0)
})
