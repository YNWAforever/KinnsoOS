import type {TripSnapshot} from '../contracts/trips';
export function exportPrivateTrip(snapshot:TripSnapshot) {
 const blob=new Blob([JSON.stringify({format:'kinnso-private-trip',version:1,snapshot},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='kinnso-private-trip.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
