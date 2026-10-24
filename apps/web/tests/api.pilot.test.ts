import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {POST} from '@/app/api/pilot/route'
import {createHmac} from 'node:crypto'
import {createServer,type Server,type RequestListener} from 'node:http'
const nativeFetch=globalThis.fetch
import {getClientIp} from '@/lib/http/client-ip'
vi.mock('@/lib/http/client-ip',()=>({getClientIp:vi.fn()}))
vi.mock('../../journeys/lib/api/server',()=>({boundedBody:async(request:Request)=>request.json()}))
const id='11111111-1111-4111-8111-111111111111'
const body={phase:'guide_viewed',flowId:id,guideId:id,sessionId:id,requestId:id}
const request=(cookie=false)=>new Request('https://web.example/api/pilot',{method:'POST',headers:{host:'web.example',origin:'https://web.example','Content-Type':'application/json','X-Kinnso-Analytics-Consent':'accepted','X-Kinnso-Consent-Version':'v1','X-Kinnso-Anonymous-Session':id,...cookie?{cookie:'kinnso-analytics-consent=v1:accepted'}:{}},body:JSON.stringify(body)})
beforeEach(()=>{
 vi.mocked(getClientIp).mockReset();vi.mocked(getClientIp).mockResolvedValue('198.51.100.10')
 vi.stubEnv('KINNSO_PILOT_PROXY_SECRET',Buffer.alloc(32,7).toString('base64url'))
 vi.stubEnv('KINNSO_ENVIRONMENT','hosted');vi.stubEnv('KINNSO_SYNTHETIC_RUN','false')
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://web.example');vi.stubEnv('ANALYTICS_INGEST_MODE','production')
 vi.stubEnv('KINNSO_JOURNEYS_ORIGIN','https://planner.example');vi.stubEnv('KINNSO_APPROVED_JOURNEYS_ORIGIN','https://planner.example')
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({ok:true,data:{queued:true}},{status:202})))
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

it('proxy identity comes from the trusted ingress helper and is bound to target, body and time',async()=>{
 const incoming=request();incoming.headers.set('x-kinnso-pilot-proxy-ip','198.51.100.99')
 await POST(incoming)
 expect(getClientIp).toHaveBeenCalledOnce()
 const [,options]=vi.mocked(fetch).mock.calls[0]
 const h=new Headers(options?.headers),ip=h.get('x-kinnso-pilot-proxy-ip'),time=h.get('x-kinnso-pilot-proxy-time')
 expect(ip).toBe('198.51.100.10');expect(time).toMatch(/^\d+$/)
 const message=['kinnso-pilot-proxy-v1','POST','https://planner.example/api/telemetry/pilot',ip,time,options?.body].join('\n')
 expect(h.get('x-kinnso-pilot-proxy-signature')).toBe(createHmac('sha256',Buffer.alloc(32,7)).update(message).digest('hex'))
 expect(JSON.parse(String(options?.body))).toEqual(body)
 expect(JSON.parse(String(options?.body))).not.toHaveProperty('ip')
})
it('different trusted visitors remain separate even when their original session identifier matches',async()=>{
 vi.mocked(getClientIp).mockResolvedValueOnce('198.51.100.10').mockResolvedValueOnce('198.51.100.11')
 expect((await POST(request())).status).toBe(202);expect((await POST(request())).status).toBe(202)
 const scopes=vi.mocked(fetch).mock.calls.map(([,o])=>new Headers(o?.headers).get('x-kinnso-pilot-proxy-ip'))
 expect(scopes).toEqual(['198.51.100.10','198.51.100.11'])
})
for(const secret of ['', 'short', 'a'.repeat(42), 'a'.repeat(44)])it('unconfigured or invalid proxy secret stops before ingress identity and outbound fetch: '+secret.length,async()=>{
 vi.stubEnv('KINNSO_PILOT_PROXY_SECRET',secret)
 expect((await POST(request())).status).toBe(503)
 expect(getClientIp).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
})
for(const ip of ['unknown','','198.51.100.10, 198.51.100.11','not-an-ip'])it('unknown or malformed trusted ingress IP is unavailable: '+ip,async()=>{
 vi.mocked(getClientIp).mockResolvedValue(ip)
 expect((await POST(request())).status).toBe(503);expect(fetch).not.toHaveBeenCalled()
})
for(const mode of ['local','synthetic'])it('local and synthetic public events do not read ingress identity or forward: '+mode,async()=>{
 if(mode==='local')vi.stubEnv('KINNSO_ENVIRONMENT','local');else vi.stubEnv('KINNSO_SYNTHETIC_RUN','true')
 await POST(request());expect(getClientIp).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
})

it('an actual307 cannot forward internal visitor metadata beyond the approved receiver',async()=>{
 const owned:Server[]=[];let leaked=0,received=0
 const listen=async(handler:RequestListener)=>{
  const server=createServer(handler);owned.push(server)
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const address=server.address()
  if(!address||typeof address==='string'||address.address!=='127.0.0.1'||address.port<1)throw Error('Owned loopback target not established')
  return `http://127.0.0.1:${address.port}`
 }
 try{
  const trap=await listen((_request,response)=>{leaked++;response.writeHead(202,{'Content-Type':'application/json'});response.end(JSON.stringify({ok:true,data:{queued:true}}))})
  const receiver=await listen((_request,response)=>{received++;response.writeHead(307,{Location:trap+'/unapproved'});response.end()})
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
   if(input!=='https://planner.example/api/telemetry/pilot')throw Error('Unexpected target')
   // Both exact owned loopback targets exist before using the real Node Fetch transport.
   return nativeFetch(receiver+'/api/telemetry/pilot',options)
  }))
  const response=await POST(request())
  expect(received).toBe(1);expect(leaked).toBe(0);expect(response.status).toBe(503)
 }finally{
  await Promise.all(owned.map(server=>new Promise<void>((resolve,reject)=>{
   server.close(error=>error?reject(error):resolve());server.closeAllConnections()
  })))
 }
})
