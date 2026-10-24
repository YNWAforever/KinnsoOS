import test from 'node:test';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),id='11111111-1111-4111-8111-111111111111';
const stubs={
 api:`export const boundedBody=async request=>request.json();export const reply=(data,status=200)=>Response.json(data,{status});export const failure=(code,status)=>Response.json({ok:false,code},{status});`,
 capabilities:`export const capabilities=()=>({telemetry:{mode:'connected'}});`,
 telemetry:`export const telemetryContext=async()=>({consent:globalThis.__pilotPorts.consent});`,
 sink:`export const pilotEvent=async()=>{globalThis.__pilotPorts.queued++;return{queued:true}};`,
 client:`export const serverClient=async()=>{const p=globalThis.__pilotPorts;p.clients++;return{rpc:async(name,args)=>{p.calls.push({name,args});const count=(p.counts.get(args.p_ip)||0)+1;p.counts.set(args.p_ip,count);return{error:p.error??null,data:p.allowed&&count<=args.p_max_requests}}}};`,
};
const compiled=await build({entryPoints:[fileURLToPath(new URL('../app/api/telemetry/pilot/route.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'no-network-boundaries',setup(b){
 b.onResolve({filter:/.*/},args=>{const key=args.path.endsWith('/api/server')?'api':args.path.endsWith('/contracts/capabilities')?'capabilities':args.path.endsWith('/telemetry/server')?'telemetry':args.path.endsWith('/telemetry/pilot-server')?'sink':args.path.endsWith('/supabase/server')?'client':null;return key?{path:key,namespace:'ports'}:null});
 b.onLoad({filter:/.*/,namespace:'ports'},args=>({contents:stubs[args.path],loader:'js'}));
}}]});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
const event={phase:'started',flowId:id,guideId:id,sessionId:id,requestId:id};
function setup(t,environment='hosted'){
 const prior={KINNSO_SITE_URL:process.env.KINNSO_SITE_URL,KINNSO_ENVIRONMENT:process.env.KINNSO_ENVIRONMENT,KINNSO_SYNTHETIC_RUN:process.env.KINNSO_SYNTHETIC_RUN,KINNSO_PILOT_PROXY_SECRET:process.env.KINNSO_PILOT_PROXY_SECRET};
 Object.assign(process.env,{KINNSO_SITE_URL:'https://planner.example',KINNSO_ENVIRONMENT:environment,KINNSO_SYNTHETIC_RUN:'false',KINNSO_PILOT_PROXY_SECRET:Buffer.alloc(32,7).toString('base64url')});
 const ports=globalThis.__pilotPorts={consent:'accepted',allowed:true,clients:0,queued:0,calls:[],counts:new Map()};
 t.after(()=>{delete globalThis.__pilotPorts;for(const[key,value]of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value});
 return ports;
}
const request=(body=event,origin='https://planner.example')=>new Request('https://planner.example/api/telemetry/pilot',{method:'POST',headers:{origin,host:'planner.example','Content-Type':'application/json'},body:JSON.stringify(body)});
test('local and synthetic public events construct no client and never enter field measurement',async t=>{
 const ports=setup(t,'local');assert.equal((await module.exports.POST(request())).status,202);assert.equal(ports.clients,0);assert.equal(ports.queued,0);
 process.env.KINNSO_ENVIRONMENT='hosted';process.env.KINNSO_SYNTHETIC_RUN='true';await module.exports.POST(request());assert.equal(ports.clients,0);
});
test('denied consent, private fields and foreign origins stop before clients or measurement',async t=>{
 const ports=setup(t);ports.consent='denied';await module.exports.POST(request());assert.equal(ports.clients,0);
 ports.consent='accepted';assert.equal((await module.exports.POST(request({...event,note:'PRIVATE'}))).status,400);
 assert.equal((await module.exports.POST(request(event,'https://foreign.example'))).status,403);assert.equal(ports.clients,0);assert.equal(ports.queued,0);
});
test('a browser cannot submit a server-only adoption or private-trip proof',async t=>{
 const ports=setup(t);assert.equal((await module.exports.POST(request({...event,phase:'adopted',tripId:id,revision:2}))).status,400);assert.equal(ports.clients,0);
});
test('public ingestion is throttled before the server measurement sink',async t=>{
 const ports=setup(t);ports.allowed=false;assert.equal((await module.exports.POST(request())).status,429);assert.equal(ports.queued,0);
 ports.allowed=true;assert.equal((await module.exports.POST(request())).status,202);assert.equal(ports.queued,1);
});

function signedRequest(ip='198.51.100.10',body=event,time=Math.floor(Date.now()/1000),target='https://planner.example'){
 const r=request(body);r.headers.set('x-vercel-forwarded-for','198.51.100.200')
 r.headers.set('x-kinnso-pilot-proxy-ip',ip);r.headers.set('x-kinnso-pilot-proxy-time',String(time))
 const text=['kinnso-pilot-proxy-v1','POST',target+'/api/telemetry/pilot',ip,String(time),JSON.stringify(body)].join('\n')
 r.headers.set('x-kinnso-pilot-proxy-signature',createHmac('sha256',Buffer.alloc(32,7)).update(text).digest('hex'))
 return r
}
test('different signed visitors do not collectively exhaust the proxy egress bucket; direct and proxy share the same visitor quota',async t=>{
 const p=setup(t)
 for(let i=0;i<600;i++)assert.equal((await module.exports.POST(signedRequest())).status,202)
 assert.equal((await module.exports.POST(signedRequest('198.51.100.11'))).status,202,'visitor B must not inherit A or proxy egress quota')
 assert.equal((await module.exports.POST(signedRequest())).status,429)
 const direct=request();direct.headers.set('x-vercel-forwarded-for','198.51.100.10')
 assert.equal((await module.exports.POST(direct)).status,429,'direct access must not gain another quota')
 assert.equal(p.counts.get('198.51.100.10'),602);assert.equal(p.counts.get('198.51.100.11'),1)
 assert.equal(p.counts.has('198.51.100.200'),false);assert.equal(p.queued,601)
 assert.ok(p.calls.every(c=>c.name==='check_and_increment_traveller_analytics_ip_rate_limit'&&c.args.p_max_requests===600&&c.args.p_window_seconds===600))
})
for(const mode of ['ip','body','origin','expired','future','partial','malformed','unconfigured'])test('forged or stale proxy metadata stops before client creation: '+mode,async t=>{
 const p=setup(t);let r=signedRequest()
 if(mode==='ip')r.headers.set('x-kinnso-pilot-proxy-ip','198.51.100.90')
 if(mode==='body')return (async()=>{const r2=signedRequest('198.51.100.10',{...event,phase:'guide_viewed'});r2.headers.set('x-kinnso-pilot-proxy-signature',r.headers.get('x-kinnso-pilot-proxy-signature'));assert.equal((await module.exports.POST(r2)).status,403);assert.equal(p.clients,0)})()
 if(mode==='origin')r.headers.set('x-kinnso-pilot-proxy-signature',signedRequest('198.51.100.10',event,Math.floor(Date.now()/1000),'https://foreign.example').headers.get('x-kinnso-pilot-proxy-signature'))
 if(mode==='expired')r=signedRequest('198.51.100.10',event,Math.floor(Date.now()/1000)-120)
 if(mode==='future')r=signedRequest('198.51.100.10',event,Math.floor(Date.now()/1000)+120)
 if(mode==='partial')r.headers.delete('x-kinnso-pilot-proxy-signature')
 if(mode==='malformed')r.headers.set('x-kinnso-pilot-proxy-signature','not-a-signature')
 if(mode==='unconfigured')delete process.env.KINNSO_PILOT_PROXY_SECRET
 assert.equal((await module.exports.POST(r)).status,403);assert.equal(p.clients,0);assert.equal(p.queued,0)
})
