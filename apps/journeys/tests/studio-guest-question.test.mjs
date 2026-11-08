import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioModule} from './helpers/studio-load.mjs';
const draft=await studioModule('guest-draft');

test('a staged question belongs to its account and task',()=>{
 draft.stageGuestQuestion('PRIVATE_A',{actorId:'actor-A',templateId:'T3'});
 assert.equal(draft.peekGuestQuestion('actor-A','T3'),'PRIVATE_A');
 assert.equal(draft.peekGuestQuestion('actor-B','T3'),'');
 assert.equal(draft.peekGuestQuestion(null,'T3'),'');
 assert.equal(draft.peekGuestQuestion('actor-A','C1'),'');
 draft.clearGuestQuestion();
 assert.equal(draft.peekGuestQuestion('actor-A','T3'),'');
});
test('a question staged for the template picker can reach the selected task once',()=>{
 draft.stageGuestQuestion('Choose a task for this',{actorId:null});
 assert.equal(draft.peekGuestQuestion(null,'T4'),'Choose a task for this');
 draft.clearGuestQuestion();
 assert.equal(draft.peekGuestQuestion(null,'C1'),'');
});
test('account invalidation clears the staged question without another navigation staging it',()=>{
 const previous=globalThis.window;
 globalThis.window=new EventTarget();
 try{
  draft.stageGuestQuestion('PRIVATE_WAITING',{actorId:'actor-A'});
  window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId:'actor-A'}}));
  assert.equal(draft.peekGuestQuestion('actor-A','C1'),'PRIVATE_WAITING');
  window.dispatchEvent(new CustomEvent('kinnso:account-invalidated',{detail:{ownerId:'actor-B'}}));
  assert.equal(draft.peekGuestQuestion('actor-A','C1'),'');
  assert.equal(draft.peekGuestQuestion('actor-B','C1'),'');
 }finally{draft.clearGuestQuestion();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('leaving the intake routes discards a pending question, while audience filtering retains it',()=>{
 assert.equal(typeof draft.retainGuestQuestionForRoute,'function');
 draft.stageGuestQuestion('PRIVATE_DETOUR',{actorId:'actor-A'});
 draft.retainGuestQuestionForRoute('workroom/templates','actor-A');
 assert.equal(draft.peekGuestQuestion('actor-A','M3'),'PRIVATE_DETOUR');
 draft.retainGuestQuestionForRoute('explore','actor-A');
 assert.equal(draft.peekGuestQuestion('actor-A','M3'),'');
 draft.stageGuestQuestion('PRIVATE_ACCOUNT',{actorId:'actor-A'});
 draft.retainGuestQuestionForRoute('workroom/templates','actor-B');
 assert.equal(draft.peekGuestQuestion('actor-A','M3'),'');
});
