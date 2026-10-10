import {request} from '../trips/repository';
import type {MediaRef} from '../contracts/trips';
export async function normalizePhoto(file:File):Promise<Blob> {
 if(file.size>10485760||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPEG, PNG or WebP up to 10 MiB. Convert HEIC first; your original is kept.');
 const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40000000)throw new Error('Image dimensions are too large.');const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image conversion failed. Original is kept.')),'image/jpeg',0.88))}finally{bitmap.close()}
}
export async function uploadPhoto(tripId:string,blob:Blob,requestId:string,signal?:AbortSignal) {
 const checkCancellation=()=>{if(signal?.aborted)throw new DOMException('Upload cancelled','AbortError')};
 checkCancellation();
 const prepared=await request<{id:string;uploadUrl:string|null;alreadyUploaded?:boolean}>('/api/media','POST',{tripId,requestId,mime:blob.type,size:blob.size},signal);checkCancellation();if(!prepared.ok)return prepared;
 if(prepared.data.alreadyUploaded!==true){
  if(typeof prepared.data.uploadUrl!=='string')throw new Error('Upload origin is unavailable');
  const url=new URL(prepared.data.uploadUrl);if(url.protocol!=='https:'&&!(location.hostname==='127.0.0.1'&&url.origin==='http://127.0.0.1:58421'))throw new Error('Upload origin is unavailable');
  const uploaded=await fetch(url,{method:'PUT',headers:{'Content-Type':blob.type},body:blob,signal});checkCancellation();
  // A concurrent immutable upload can still complete before its response.
  if(!uploaded.ok&&![400,409].includes(uploaded.status))throw new Error('Upload interrupted; original is kept.');
 }
 const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 checkCancellation();
 const finalized=await request<MediaRef>('/api/media/finalize','POST',{id:prepared.data.id,checksum},signal);
 checkCancellation();return finalized;
}
