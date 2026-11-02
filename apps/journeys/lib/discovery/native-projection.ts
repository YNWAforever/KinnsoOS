/** Candidate projection for original SQL reader integration, not enabled in public routes.
 * Bindings/decisions MUST come from the authoritative transaction, never browser input. */
export type NativeBinding={fieldPath:string;grantId:string;grantVersion:number;publicationId:string;publicationContentVersion:number};
const FIELDS=['root_metadata','title','summary','city','day_title','sourceDescription','description'];
export function projectNativeRecord<T extends Record<string,unknown>>(original:T,bindings:NativeBinding[],allowed:(binding:NativeBinding)=>boolean):T{
 const output=structuredClone(original) as Record<string,unknown>;
 if(bindings.length>400)throw Error('RESTRICTED');
 for(const binding of bindings){
  if(!FIELDS.includes(binding.fieldPath)||!binding.grantId||!binding.publicationId||!Number.isSafeInteger(binding.grantVersion)||binding.grantVersion<1||!Number.isSafeInteger(binding.publicationContentVersion)||binding.publicationContentVersion<1)throw Error('RESTRICTED');
  if(allowed(binding))continue;
  const fields=binding.fieldPath==='root_metadata'?['title','summary','city']:[binding.fieldPath];
  for(const field of fields)if(Object.hasOwn(output,field))output[field]=['title','day_title'].includes(field)?'內容權限受限':'';
 }
 return output as T;
}
