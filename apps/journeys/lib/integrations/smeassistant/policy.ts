import type {ToolName,VerifiedSmePrincipal,VerifiedLinkContext} from './contracts.ts';
export const SME_LIMITS={deadlineMs:15000,maxBytes:1048576,concurrency:2,perMinute:60,proofPerMinute:10,proofLifetimeMs:300000} as const;
export const SME_ANNOTATIONS={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
export function authorizeSmeTool(principal:VerifiedSmePrincipal,tool:ToolName,input:Record<string,unknown>,context?:VerifiedLinkContext){
 if(!principal.active)throw Error('NOT_CONNECTED');
 if(principal.issuer!=='urn:kinnso:fixture:sme'||principal.audience!=='urn:kinnso:fixture:client')throw Error('FORBIDDEN');
 if(context&&context.workspaceId!==principal.workspaceId)throw Error('FORBIDDEN');
 const required=tool==='sme_link_attestation_v1'?['link:attest']:tool==='sme_merchant_context_v1'?['merchant:read']:tool==='sme_offer_evidence_v1'?['offers:read','evidence:read']:tool==='sme_connection_status_v1'?[]:['offers:read'];
 if(required.some(s=>!principal.scopes.includes(s))||tool==='sme_link_attestation_v1'&&principal.role!=='owner')throw Error('FORBIDDEN');
 const ids=input.locationId?[String(input.locationId)]:Array.isArray(input.locationIds)?input.locationIds as string[]:Array.isArray(input.refs)?input.refs.map(r=>(r as {locationId:string}).locationId):[];
 if(ids.some(id=>!principal.locationIds.includes(id)||context&&!context.locationIds.includes(id)))throw Error('FORBIDDEN');
}
