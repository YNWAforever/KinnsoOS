import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
async function load(relative,stubs=[]){
 const compiled=await build({entryPoints:[fileURLToPath(new URL(relative,import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'route-contracts',setup(builder){
  for(const [filter,path,contents] of stubs){builder.onResolve({filter},()=>({path,namespace:'route-contract'}));builder.onLoad({filter:new RegExp('^'+path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),namespace:'route-contract'},()=>({contents,loader:'js'}));}
 }}]});
 const module={exports:{}};
 new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
 return module.exports;
}

test('retention route authenticates, purges once and sanitizes failures',async t=>{
 const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='s3cret';t.after(()=>{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;});
 const calls=[];globalThis.__retentionService={rpc:async name=>{calls.push(name);return{data:null,error:null};}};
 t.after(()=>{delete globalThis.__retentionService;});
 const route=await load('../app/api/cron/traveller-analytics-retention/route.ts',[[/telemetry\/server$/,'telemetry','export function telemetryService(){return globalThis.__retentionService}']]);
 let response=await route.GET(new Request('https://kinnso.test/api/cron/traveller-analytics-retention'));
 assert.equal(response.status,401);assert.equal(calls.length,0);
 response=await route.GET(new Request('https://kinnso.test/api/cron/traveller-analytics-retention',{headers:{authorization:'Bearer s3cret'}}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.deepEqual(calls,['purge_traveller_analytics_events']);
 globalThis.__retentionService={rpc:async()=>({error:{message:'private database detail'}})};
 response=await route.GET(new Request('https://kinnso.test/api/cron/traveller-analytics-retention',{headers:{authorization:'Bearer s3cret'}}));
 assert.equal(response.status,500);assert.deepEqual(await response.json(),{ok:false,error:'retention failed'});
});

test('revalidation route requires its secret and bounded native path',async t=>{
 const previous=process.env.REVALIDATE_SECRET;process.env.REVALIDATE_SECRET='revalidate-secret';t.after(()=>{if(previous===undefined)delete process.env.REVALIDATE_SECRET;else process.env.REVALIDATE_SECRET=previous;});
 globalThis.__revalidateCalls=[];t.after(()=>{delete globalThis.__revalidateCalls;});
 const route=await load('../app/api/revalidate/route.ts',[[/^next\/cache$/,'next-cache','export function revalidatePath(value){globalThis.__revalidateCalls.push(value)}']]);
 const request=(body,secret)=>new Request('https://kinnso.test/api/revalidate',{method:'POST',headers:{'content-type':'application/json',...(secret?{'x-revalidate-secret':secret}:{})},body:JSON.stringify(body)});
 let response=await route.POST(request({path:'/en/articles'},'wrong'));assert.equal(response.status,401);assert.equal(globalThis.__revalidateCalls.length,0);
 for(const path of ['', '//evil.test', '/en/%0d%0aheader', '/en/articles?secret=1', '../private'])response=await route.POST(request({path},'revalidate-secret')),assert.equal(response.status,400,path);
 response=await route.POST(request({path:'/en/articles'}));assert.equal(response.status,401);
 response=await route.POST(request({path:'/en/articles'},'revalidate-secret'));assert.equal(response.status,200);assert.deepEqual(globalThis.__revalidateCalls,['/en/articles']);
});
