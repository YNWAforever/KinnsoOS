import {after} from 'next/server';
import {headers} from 'next/headers';
import {telemetryContext,telemetryService} from './server';
import {parsePilotEvent,recordPilotEvent,type PilotEvent} from './pilot';
import {capabilities} from '../contracts/capabilities';
export async function pilotEvent(actor:{id:string;roles:string[]}|null,value:Omit<PilotEvent,'sessionId'>&{sessionId?:string}){
 try{
  if(process.env.KINNSO_ENVIRONMENT==='local'||process.env.KINNSO_SYNTHETIC_RUN==='true'||capabilities(process.env).telemetry.mode!=='connected')return{queued:false};
  const event=parsePilotEvent({...value,sessionId:value.sessionId??(await headers()).get('x-kinnso-pilot-session')});
  if(!event)return{queued:false};
  const context=await telemetryContext(actor);
  if(context.consent!=='accepted'||context.context==='admin')return{queued:false};
  const persist=async()=>{try{
   const service=telemetryService();
   if(service)return await recordPilotEvent(service,actor?.id??null,event,{...context,environment:process.env.KINNSO_ENVIRONMENT??'unknown',synthetic:process.env.KINNSO_SYNTHETIC_RUN==='true'});
  }catch{/* Measurement never reverses a durable command or successful read. */}return{accepted:false}};
  // Order server proofs before the next response-triggered read. The existing service timeout bounds this optional work.
  if(actor)return{queued:(await persist()).accepted};
  after(async()=>{await persist()});
  return{queued:true};
 }catch{return{queued:false}}
}
