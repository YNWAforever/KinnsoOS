import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {POST} from '@/app/api/pilot/route'
const id='11111111-1111-4111-8111-111111111111'
const body={phase:'guide_viewed',flowId:id,guideId:id,sessionId:id,requestId:id}
const request=(cookie=false)=>new Request('https://web.example/api/pilot',{method:'POST',headers:{host:'web.example',origin:'https://web.example','Content-Type':'application/json','X-Kinnso-Analytics-Consent':'accepted','X-Kinnso-Consent-Version':'v1','X-Kinnso-Anonymous-Session':id,...cookie?{cookie:'kinnso-analytics-consent=v1:accepted'}:{}},body:JSON.stringify(body)})
beforeEach(()=>{
 vi.stubEnv('KINNSO_ENVIRONMENT','hosted');vi.stubEnv('KINNSO_SYNTHETIC_RUN','false')
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://web.example');vi.stubEnv('ANALYTICS_INGEST_MODE','production')
 vi.stubEnv('KINNSO_JOURNEYS_ORIGIN','https://planner.example');vi.stubEnv('KINNSO_APPROVED_JOURNEYS_ORIGIN','https://planner.example')
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ok:true,data:{queued:true}},{status:202})))
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('normal web consent uses its existing explicit versioned client contract without requiring a Journeys cookie',async()=>{
 const response=await POST(request())
 expect(response.status).toBe(202);expect(fetch).toHaveBeenCalledOnce()
 expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://planner.example/api/telemetry/pilot')
})
for(const mode of ['disabled','test',''])it('nonproduction analytics mode creates no outbound pilot ingestion: '+mode,async()=>{
 vi.stubEnv('ANALYTICS_INGEST_MODE',mode)
 await POST(request(true));expect(fetch).not.toHaveBeenCalled()
})
