import {parseSmeInput,parseSmeResult,type SmeReadResult,type ToolName,type VerifiedLinkContext} from './contracts.ts';
import {SME_LIMITS} from './policy.ts';
/** Transport is injected. This module never chooses an endpoint or creates credentials. */
export class SmeReadClient{
 constructor(private transport:(tool:ToolName,input:unknown,context:VerifiedLinkContext,signal:AbortSignal)=>Promise<unknown>){}
 async call(tool:ToolName,input:unknown,context:VerifiedLinkContext):Promise<SmeReadResult<unknown>>{
  const requestId=crypto.randomUUID(),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{const parsed=parseSmeInput(tool,input);const value=await Promise.race([this.transport(tool,parsed,context,controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'));},SME_LIMITS.deadlineMs);})]);return parseSmeResult(tool,value);}
  catch(e){const code=e instanceof Error&&['TIMEOUT','UNSUPPORTED','INVALID'].includes(e.message)?e.message as 'TIMEOUT'|'UNSUPPORTED'|'INVALID':'UNAVAILABLE';return {schemaVersion:'kinnso.sme.read.v1',status:'error',requestId,code,retryable:code==='TIMEOUT'||code==='UNAVAILABLE'};}
  finally{if(timer)clearTimeout(timer);}
 }
}
