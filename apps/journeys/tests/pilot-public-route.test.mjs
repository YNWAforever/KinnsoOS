import test from 'node:test';
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
 client:`export const serverClient=async()=>{globalThis.__pilotPorts.clients++;return{rpc:async()=>({error:null,data:globalThis.__pilotPorts.allowed})}};`,
};
const compiled=await build({entryPoints:[fileURLToPath(new URL('../app/api/telemetry/pilot/route.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'no-network-boundaries',setup(b){
 b.onResolve({filter:/.*/},args=>{const key=args.path.endsWith('/api/server')?'api':args.path.endsWith('/contracts/capabilities')?'capabilities':args.path.endsWith('/telemetry/server')?'telemetry':args.path.endsWith('/telemetry/pilot-server')?'sink':args.path.endsWith('/supabase/server')?'client':null;return key?{path:key,namespace:'ports'}:null});
 b.onLoad({filter:/.*/,namespace:'ports'},args=>({contents:stubs[args.path],loader:'js'}));
}}]});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
const event={phase:'started',flowId:id,guideId:id,sessionId:id,requestId:id};
function setup(t,environment='hosted'){
 const prior={KINNSO_SITE_URL:process.env.KINNSO_SITE_URL,KINNSO_ENVIRONMENT:process.env.KINNSO_ENVIRONMENT,KINNSO_SYNTHETIC_RUN:process.env.KINNSO_SYNTHETIC_RUN};
 Object.assign(process.env,{KINNSO_SITE_URL:'https://planner.example',KINNSO_ENVIRONMENT:environment,KINNSO_SYNTHETIC_RUN:'false'});
 const ports=globalThis.__pilotPorts={consent:'accepted',allowed:true,clients:0,queued:0};
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
