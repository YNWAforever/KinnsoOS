/** Source events remain in the inbox longer than the seven-day measurement receipt.
 * Only recent committed outcomes are eligible, so pruning cannot count old events again.
 * This measures consented observations, not all outcomes or unique people.
 */
export function recentVerifiedOutcome(event:{type?:unknown;createdAt?:unknown},now=Date.now()):boolean {
 if(!['submission.approved','settlement.created'].includes(String(event.type))||typeof event.createdAt!=='string')return false;
 const at=Date.parse(event.createdAt),age=now-at;
 return Number.isFinite(at)&&age>=0&&age<7*86400000;
}
