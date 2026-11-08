import {revalidatePath} from 'next/cache';
import {secretEqual} from '../../../lib/security/secrets';

function path(value:unknown){
 if(typeof value!=='string'||value.length>2048||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x20\x7f-\x9f]/.test(value)||value.includes('?')||value.includes('#'))return null;
 try{
  const decoded=decodeURIComponent(value);
  if(decoded.startsWith('//')||decoded.split('/').includes('..')||/[\\\x00-\x20\x7f-\x9f]/.test(decoded)||/%(?:25|2f|5c)/i.test(value))return null;
 }catch{return null;}
 return value;
}

export async function POST(request:Request){
 if(!secretEqual(request.headers.get('x-revalidate-secret'),process.env.REVALIDATE_SECRET))return Response.json({ok:false,error:'unauthorized'},{status:401});
 let body:unknown;
 try{body=await request.json();}catch{return Response.json({ok:false,error:'bad path'},{status:400});}
 const target=body&&typeof body==='object'&&!Array.isArray(body)?path((body as Record<string,unknown>).path):null;
 if(!target)return Response.json({ok:false,error:'bad path'},{status:400});
 revalidatePath(target);
 return Response.json({ok:true,revalidated:target},{headers:{'Cache-Control':'no-store'}});
}
