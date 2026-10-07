import {createHmac,timingSafeEqual} from 'node:crypto';
import {safeReturnPath} from './return-path.ts';
export type RecoveryState={userId:string;sessionId:string;locale:'en'|'zh-HK';next:string};
export type RecoveryProof=RecoveryState&{expiresAt:number};
export function recoveryConfigured(secret:string|undefined):secret is string{return typeof secret==='string'&&secret.length>=32;}
function signature(body:string,secret:string){return createHmac('sha256',secret).update('kinnso-recovery-v1:'+body).digest();}
export function createRecoveryProof(state:RecoveryState,secret:string,now=Math.floor(Date.now()/1000)):string{
 if(!recoveryConfigured(secret)||!state.userId||!state.sessionId)throw Error('Configured recovery binding required');
 const body=Buffer.from(JSON.stringify({...state,next:safeReturnPath(state.next,state.locale),expiresAt:now+900})).toString('base64url');
 return body+'.'+signature(body,secret).toString('base64url');
}
export function readRecoveryProof(value:string|undefined,secret:string|undefined,actor:{userId:string;sessionId:string},now=Math.floor(Date.now()/1000)):RecoveryProof|null{
 if(!value||value.length>8192||!recoveryConfigured(secret))return null;
 try{
  const parts=value.split('.');if(parts.length!==2)return null;
  const actual=Buffer.from(parts[1],'base64url'),expected=signature(parts[0],secret);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  const state=JSON.parse(Buffer.from(parts[0],'base64url').toString()) as RecoveryProof;
  if(state.userId!==actor.userId||state.sessionId!==actor.sessionId||!actor.sessionId||!Number.isInteger(state.expiresAt)||state.expiresAt<=now||state.expiresAt>now+900||!['en','zh-HK'].includes(state.locale)||safeReturnPath(state.next,state.locale)!==state.next)return null;
  return state;
 }catch{return null;}
}
