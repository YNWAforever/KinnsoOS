'use client';
import {useEffect,useState} from 'react';
import {peekGuestQuestion,clearGuestQuestion} from '../../lib/studio/guest-draft';
import {subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import type {TemplateId} from '../../lib/studio/contracts';

/** Consume the homepage handoff once; a reload deliberately starts empty. */
export function useStudioQuestion(actorId:string|null,templateId:TemplateId,fallback='',acceptStaged=true){
 const state=useState(()=>(acceptStaged?peekGuestQuestion(actorId,templateId):'')||fallback);
 const [,setQuestion]=state;
 useEffect(()=>{
  clearGuestQuestion();
  return subscribeAccountInvalidation(next=>{if(next!==actorId){clearGuestQuestion();setQuestion('');}});
 },[actorId,setQuestion]);
 return state;
}
