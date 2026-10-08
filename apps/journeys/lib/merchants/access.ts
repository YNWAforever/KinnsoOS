export type AccessBranch={id:string;name:string;active?:boolean};
export function parseCommissionPercent(value:string):number|null{
 if(!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value))return null;
 return Number(value);
}
// Explanatory preview only. Canonical RPC membership/branch checks authorize writes.
export function previewMemberAccess(role:string,active:boolean,branchIds:string[],branches:AccessBranch[]){
 const unavailableBranchIds=branchIds.filter(id=>!branches.some(b=>b.id===id&&b.active!==false));
 const valid=['marketing','clerk','finance'].includes(role)&&new Set(branchIds).size===branchIds.length&&branchIds.length<=100&&unavailableBranchIds.length===0;
 const scoped=valid&&active&&branchIds.length>0;
 return{valid,branchNames:branchIds.flatMap(id=>{const b=branches.find(x=>x.id===id);return b?[b.name]:[];}),unavailableBranchIds,canPublish:valid&&active&&role==='marketing',canRedeem:scoped&&role==='clerk',canReadFinance:scoped&&role==='finance'};
}
