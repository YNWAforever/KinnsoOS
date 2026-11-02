import {Blocked} from './target.mjs';

export function assertCleanupIdentity(expected,fresh){
  const sameIds=Array.isArray(fresh?.containerIds)&&Array.isArray(expected?.containerIds)&&
    fresh.containerIds.length===4&&new Set(fresh.containerIds).size===4&&
    fresh.containerIds.every(id=>expected.containerIds.includes(id))&&expected.containerIds.every(id=>fresh.containerIds.includes(id));
  if(!sameIds||expected.runId!==fresh.runId||expected.networkId!==fresh.networkId||expected.volumeId!==fresh.volumeId||
    JSON.stringify(expected.imageDigests)!==JSON.stringify(fresh.imageDigests))throw new Blocked('CLEANUP_TARGET_CHANGED');
  return true;
}
