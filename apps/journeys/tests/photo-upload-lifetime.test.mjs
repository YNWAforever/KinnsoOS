import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const output=await build({entryPoints:[fileURLToPath(new URL('../lib/media/uploads.ts',import.meta.url))],bundle:true,write:false,platform:'browser',format:'esm'});
const {uploadPhoto}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
Object.defineProperty(globalThis,'location',{value:{hostname:'127.0.0.1'},configurable:true});
after(()=>{if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else delete globalThis.location});
for(const point of ['before prepare','after prepare','after upload','after finalize']){
 test(`photo cancellation ${point} stops further writes`,async t=>{
  const controller=new AbortController(),calls=[];
  if(point==='before prepare')controller.abort();

  t.mock.method(globalThis,'fetch',async(input,init)=>{
   const path=String(input);calls.push(path);
   if(path==='/api/media'){
    if(point==='after prepare')controller.abort();
    return Response.json({ok:true,data:{id:'synthetic-id',uploadUrl:'http://127.0.0.1:58421/storage/v1/object/upload/sign/synthetic'}});
   }
   if(path==='/api/media/finalize'){
    if(point==='after finalize')controller.abort();
    return Response.json({ok:true,data:{id:'synthetic-id',state:'ready'}});
   }
   if(point==='after upload')controller.abort();
   return new Response(null,{status:200});
  });
  await assert.rejects(uploadPhoto('synthetic-trip',new Blob(['photo'],{type:'image/jpeg'}),'synthetic-request',controller.signal),{name:'AbortError'});
  const expected=point==='before prepare'?0:point==='after prepare'?1:point==='after upload'?2:3;
  assert.equal(calls.length,expected);
 });
}
test('an owned retry still finalizes an immutable upload and uses its original request id',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  calls.push({url:String(input),init});
  if(input==='/api/media')return Response.json({ok:true,data:{id:'synthetic-id',uploadUrl:'http://127.0.0.1:58421/storage/v1/object/upload/sign/synthetic'}});
  if(input==='/api/media/finalize')return Response.json({ok:true,data:{id:'synthetic-id',state:'ready'}});
  return new Response(null,{status:409});
 });
 const result=await uploadPhoto('synthetic-trip',new Blob(['photo'],{type:'image/jpeg'}),'kept-request',new AbortController().signal);
 assert.equal(result.ok,true);assert.equal(JSON.parse(calls[0].init.body).requestId,'kept-request');assert.equal(calls.length,3);
});
test('server-confirmed existing bytes still require checksum finalization and never re-upload',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(input,init)=>{
  calls.push(String(input));
  if(input==='/api/media')return Response.json({ok:true,data:{id:'synthetic-id',uploadUrl:null,alreadyUploaded:true}});
  if(input==='/api/media/finalize')return Response.json({ok:true,data:{id:'synthetic-id',state:'ready'}});
  throw Error('Unexpected byte overwrite');
 });
 const result=await uploadPhoto('synthetic-trip',new Blob(['photo'],{type:'image/jpeg'}),'kept-request');assert.equal(result.ok,true);assert.deepEqual(calls,['/api/media','/api/media/finalize']);
});
