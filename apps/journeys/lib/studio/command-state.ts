import type {StudioEnvelope} from './contracts';
export type CommandPhase='draft'|'dirty'|'pending'|'unknown'|'verified'|'conflict'|'denied'|'invalid';
export type CommandState={scope:string;phase:CommandPhase;editRevision:number;savedEditRevision:number;savedRevision:number;intent:StudioEnvelope<unknown>|null;intentEditRevision:number};
export type CommandEvent={type:'edit'|'unknown'|'receiptMissing'|'conflict'|'resolveConflict'|'denied'|'invalid'}|{type:'scope';scope:string}|{type:'verified';scope:string;requestId:string;revision:number};
export const initialCommandState=(scope:string):CommandState=>({scope,phase:'draft',editRevision:0,savedEditRevision:0,savedRevision:0,intent:null,intentEditRevision:0});
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function beginCommand(state:CommandState,intent:StudioEnvelope<unknown>):CommandState{
 if(state.phase==='conflict')throw Error('CONFLICT_REVIEW_REQUIRED');
 if(state.intent)throw Error('PENDING_INTENT');
 return{...state,phase:'pending',intent:freeze(structuredClone(intent)),intentEditRevision:state.editRevision};
}
export function reduceStudioCommand(state:CommandState,event:CommandEvent):CommandState{
 if(event.type==='scope')return initialCommandState(event.scope);
 if(event.type==='edit')return{...state,editRevision:state.editRevision+1,phase:state.intent?state.phase:'dirty'};
 if(event.type==='verified'){
  if(event.scope!==state.scope||event.requestId!==state.intent?.requestId)return state;
  return{...state,phase:state.editRevision===state.intentEditRevision?'verified':'dirty',intent:null,savedRevision:event.revision,savedEditRevision:state.intentEditRevision};
 }
 if(event.type==='unknown'||event.type==='receiptMissing')return{...state,phase:'unknown'};
 if(event.type==='conflict')return{...state,phase:'conflict',intent:null};
 if(event.type==='resolveConflict')return{...state,phase:'dirty',intent:null};
 return{...state,phase:event.type,intent:null};
}
