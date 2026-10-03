import {sharedMedia} from '@/lib/media/service'
export async function GET(request:Request,{params}:{params:Promise<{token:string;id:string}>}) {
 const {token,id}=await params
 if(!/^[0-9a-f]{64}$/.test(token)||!/^[-0-9a-f]{36}$/.test(id))return new Response(null,{status:404})
 try{const data=await sharedMedia(token,id,process.env);return new Response(data.blob,{headers:{'Content-Type':data.mime,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})}catch{return new Response(null,{status:404,headers:{'Cache-Control':'private, no-store'}})}
}
