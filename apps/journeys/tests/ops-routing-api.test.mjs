import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
import * as validation from '../lib/api/validation.ts';
import * as filters from '../lib/ops/queue-filters.ts';
const id='11111111-1111-4111-8111-111111111111';
for(const [route,payload,rpc] of [
 ['assignments',{submissionId:id,memberId:null,expectedRevision:0,reason:'Audit',requestId:id},'set_kinnso_review_assignment'],
 ['presets',{id,expectedRevision:0,requestId:id,command:{type:'save',name:'Saved',filter:{assignment:'mine',order:'deadline'}}},'command_kinnso_review_preset'],
])test('routing '+route+' rejects private/invalid payloads, preserves denial and treats thrown RPC outcome as unknown',async()=>{
 const source=await readFile(new URL('../app/api/ops/'+route+'/route.ts',import.meta.url),'utf8');const compiled=await transform(source,{loader:'ts',format:'cjs',target:'es2022'});const module={exports:{}},calls=[];let denied=false,throws=false;
 runInContext(compiled.code,createContext({module,exports:module.exports,require:name=>{
  if(name.endsWith('/api/validation'))return validation;if(name.endsWith('/ops/queue-filters'))return filters;
  if(name.endsWith('/api/server'))return{apiContext:async(_request,_capability,write)=>{assert.equal(write,true);return denied?{response:new Response('{}',{status:403})}:{client:{rpc:async(...args)=>{calls.push(args);if(throws)throw Error('Unknown network outcome');return{data:{revision:1},error:null};}}};},boundedBody:request=>request.json(),failure:(_code,status)=>new Response('{}',{status}),reply:data=>Response.json(data),backendFailure:()=>new Response('{}',{status:503})};
  throw Error('Unexpected dependency '+name);
 }}));
 const request=body=>new Request('https://local.test/api/ops/'+route,{method:'POST',headers:{origin:'https://local.test','content-type':'application/json'},body:JSON.stringify(body)});
 denied=true;assert.equal((await module.exports.POST(request(payload))).status,403);assert.equal(calls.length,0);denied=false;
 for(const bad of [{...payload,notes:'PRIVATE'},{...payload,expectedRevision:-1},{...payload,requestId:'invalid'},route==='presets'?{...payload,command:{type:'save',name:'Saved',filter:{results:'PRIVATE'}}}:{...payload,reason:''}])assert.equal((await module.exports.POST(request(bad))).status,400);
 assert.equal(calls.length,0);assert.equal((await module.exports.POST(request(payload))).status,200);assert.equal(calls[0][0],rpc);
 throws=true;assert.equal((await module.exports.POST(request(payload))).status,503,'An unknown RPC outcome must retain its idempotent request');
});
