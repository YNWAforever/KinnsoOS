import type {PublicTripProjection} from './trips';
export type ShareIntent={requestId:string;tripId:string;stopIds:string[];mediaIds:string[];expiresAt:string};
export type ShareReceiptState='active'|'revoked'|'expired';
export type ShareReceiptRow={requestId:string;id:string;createdAt:string;expiresAt:string;state:ShareReceiptState};
export type ShareReceipt=ShareReceiptRow&{intent:ShareIntent;projection:PublicTripProjection;url:string|null};
export type ShareReceiptCursor={createdAt:string;requestId:string};
export type ShareReceiptPage={items:ShareReceiptRow[];nextCursor:ShareReceiptCursor|null};
export type ShareTokenEnvelope={v:1;kid:string;iv:string;ciphertext:string;tag:string};
export function shareReceiptKeyring(env:Record<string,string|undefined>):{active:string;keys:Record<string,string>}|null {
 try{
  const active=env.KINNSO_SHARE_RECEIPT_ACTIVE_KEY,raw=env.KINNSO_SHARE_RECEIPT_KEYS;
  if(!active||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(active)||!raw||raw.length>8192)return null;
  const keys:unknown=JSON.parse(raw);if(!keys||typeof keys!=='object'||Array.isArray(keys))return null;
  const entries=Object.entries(keys);if(entries.length<1||entries.length>8)return null;
  for(const [id,key] of entries){if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(id)||typeof key!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(key))return null;
   const bytes=Buffer.from(key,'base64');if(bytes.length!==32||bytes.toString('base64')!==key)return null;
  }
  if(!Object.hasOwn(keys,active))return null;return {active,keys:keys as Record<string,string>};
 }catch{return null;}
}
export const shareRecoveryConfigured=(env:Record<string,string|undefined>)=>shareReceiptKeyring(env)!==null;
