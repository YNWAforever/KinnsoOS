import { backendTarget } from '../contracts/capabilities.ts';
import type { Environment } from '../contracts/capabilities.ts';
export function destinationAlias(query:string):string|null {
 const value=query.normalize('NFKC').trim().toLowerCase();
 return ['京都','kyoto'].includes(value) ? 'Kyoto' : ['香港','hong kong'].includes(value) ? 'Hong Kong' : null;
}
export async function resolveDestination(query:string,env:Environment=process.env) {
 const target=backendTarget(env);if(!target)throw new Error('UNAVAILABLE');
 const result=await fetch(target.origin+'/rest/v1/rpc/resolve_kinnso_destination',{method:'POST',headers:{apikey:target.key,'Content-Type':'application/json'},body:JSON.stringify({p_query:query}),cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!result.ok)throw new Error('UNAVAILABLE');
 const value=await result.json();
 if(value===null)return null;
 if(typeof value.id!=='string'||typeof value.displayName!=='string')throw new Error('INVALID');
 return value as {id:string;displayName:string};
}
