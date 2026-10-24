import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {shareReceiptKeyring} from '../contracts/capabilities.ts';
import type {ShareTokenEnvelope} from '../contracts/share-receipts';
type Context={actorId:string;tripId:string;requestId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable=()=>new Error('Share recovery unavailable');
function aad(context:Context){
 if(![context.actorId,context.tripId,context.requestId].every(id=>typeof id==='string'&&uuid.test(id)))throw unavailable();
 return Buffer.from('kinnso:trip-share:v1:'+context.actorId.toLowerCase()+':'+context.tripId.toLowerCase()+':'+context.requestId.toLowerCase());
}
export function sealShareToken(token:string,context:Context,env:Record<string,string|undefined>=process.env):ShareTokenEnvelope {
 const ring=shareReceiptKeyring(env);if(!ring||!/^[0-9a-f]{64}$/.test(token))throw unavailable();
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(ring.keys[ring.active],'base64'),iv);cipher.setAAD(aad(context));
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return {v:1,kid:ring.active,iv:iv.toString('hex'),ciphertext:ciphertext.toString('hex'),tag:cipher.getAuthTag().toString('hex')};
}
export function recoverShareToken(value:unknown,context:Context,env:Record<string,string|undefined>=process.env):string {
 try{
  const ring=shareReceiptKeyring(env);if(!ring||!value||typeof value!=='object'||Array.isArray(value))throw unavailable();
  const e=value as ShareTokenEnvelope;if(Object.keys(e).sort().join(',')!=='ciphertext,iv,kid,tag,v'||e.v!==1||typeof e.kid!=='string'||!Object.hasOwn(ring.keys,e.kid)||
   typeof e.iv!=='string'||!/^[0-9a-f]{24}$/.test(e.iv)||typeof e.ciphertext!=='string'||!/^[0-9a-f]{128}$/.test(e.ciphertext)||typeof e.tag!=='string'||!/^[0-9a-f]{32}$/.test(e.tag))throw unavailable();
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(ring.keys[e.kid],'base64'),Buffer.from(e.iv,'hex'));decipher.setAAD(aad(context));decipher.setAuthTag(Buffer.from(e.tag,'hex'));
  const token=Buffer.concat([decipher.update(Buffer.from(e.ciphertext,'hex')),decipher.final()]).toString('utf8');if(!/^[0-9a-f]{64}$/.test(token))throw unavailable();return token;
 }catch{throw unavailable();}
}
export function newShareToken(context:Context,env:Record<string,string|undefined>=process.env):{tokenHash:string;envelope:ShareTokenEnvelope} {
 const token=randomBytes(32).toString('hex');return {tokenHash:createHash('sha256').update(token).digest('hex'),envelope:sealShareToken(token,context,env)};
}
