import type {TemplateId} from './contracts';
import {subscribeAccountInvalidation} from '../trips/local-drafts';

// In-memory navigation only: no private question in URL, cookies or web storage.
// An unassigned template is allowed only during the explicit template detour.
type QuestionScope={actorId:string|null;templateId?:TemplateId};
let draft:({question:string}&QuestionScope)|null=null;
let unsubscribe:(()=>void)|undefined;

export function clearGuestQuestion(){draft=null;unsubscribe?.();unsubscribe=undefined;}
export function stageGuestQuestion(value:string,scope:QuestionScope={actorId:null}){
 clearGuestQuestion();
 if(!value.trim())return;
 draft={...scope,question:value.slice(0,8000)};
 if(typeof window!=='undefined')unsubscribe=subscribeAccountInvalidation(next=>{
  if(next!==draft?.actorId)clearGuestQuestion();
 });
}
export function peekGuestQuestion(actorId:string|null=null,templateId:TemplateId='C1'){
 return draft?.actorId===actorId&&(!draft.templateId||draft.templateId===templateId)?draft.question:'';
}

/** The handoff expires when its explicit intake detour is abandoned. */
export function retainGuestQuestionForRoute(path:string,actorId:string|null){
 if(draft&&(draft.actorId!==actorId||!['workroom','workroom/templates','workroom/documents'].includes(path)))clearGuestQuestion();
}
