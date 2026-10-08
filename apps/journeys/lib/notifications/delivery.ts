export type DeliveryClaim={id:string;eventId:string;recipientId:string;channel:'email';type:string;entityType:string;entityId:string;templateVersion:string;provider:string;attempts:number;leaseToken:string};
/** Legacy boolean name retained for exact pending-completion replay: true means provider acceptance, never verified delivery. */
export type DeliveryCompletion={id:string;leaseToken:string;delivered:boolean;receipt:string|null};
export type DeliveryStore={claim:()=>Promise<DeliveryClaim|null>;authorizeSend:(id:string,leaseToken:string,provider:string,templateVersion:string)=>Promise<{authorized:boolean;state:'sending'|'suppressed'|'stale'}>;finish:(id:string,leaseToken:string,delivered:boolean,receipt:string|null)=>Promise<{state:'accepted'|'delivered'|'retry'|'dead_letter'|'suppressed';attempts:number}>};
export type ApprovedProvider={name:string;templateVersion:string;send:(event:DeliveryClaim,idempotencyKey:string)=>Promise<{receipt:string}>};
/** Runs after business commit. It never calls a payment, redemption or business command. */
export async function deliverNext(store:DeliveryStore,provider:ApprovedProvider|null){
 if(!provider)return {state:'unconfigured' as const};
 const claim=await store.claim();if(!claim)return {state:'idle' as const};
 if(claim.provider!==provider.name||claim.templateVersion!==provider.templateVersion)return completeDelivery(store,{id:claim.id,leaseToken:claim.leaseToken,delivered:false,receipt:null});
 // This transaction is the send-start boundary. Opt-out before it suppresses
 // delivery; a send already started cannot be recalled. Never use claim-time authority.
 const authorization=await store.authorizeSend(claim.id,claim.leaseToken,provider.name,provider.templateVersion);
 if(!authorization.authorized)return {state:authorization.state};
 let completion:DeliveryCompletion;
 try{const result=await provider.send(claim,claim.eventId+':'+claim.channel);if(!result.receipt||result.receipt.length>200)throw new Error('invalid_receipt');completion={id:claim.id,leaseToken:claim.leaseToken,delivered:true,receipt:result.receipt};}
 catch{completion={id:claim.id,leaseToken:claim.leaseToken,delivered:false,receipt:null};}
 return completeDelivery(store,completion);
}
/** Retry this exact completion after an unknown acknowledgement; do not send again. */
export async function completeDelivery(store:Pick<DeliveryStore,'finish'>,completion:DeliveryCompletion){
 // Old store acknowledgements have no recipient-delivery proof. Normalize the
 // response only; retain the exact completion material and immutable receipts.
 try{const result=await store.finish(completion.id,completion.leaseToken,completion.delivered,completion.receipt);return result.state==='delivered'?{...result,state:'accepted' as const}:result;}
 catch{return {state:'acknowledgement_unknown' as const,completion};}
}
