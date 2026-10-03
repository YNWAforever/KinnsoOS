import {NextRequest} from 'next/server'
import {finalizeMedia} from '@/lib/media/service'
export async function POST(request:NextRequest) {
 if(!process.env.KINNSO_JOURNEYS_ORIGIN||request.headers.get('origin')!==process.env.KINNSO_JOURNEYS_ORIGIN)return Response.json({ok:false,code:'FORBIDDEN'},{status:403,headers:{'Cache-Control':'private, no-store'}})
 try{
  if(Number(request.headers.get('content-length'))>4096)throw new Error('INVALID')
  const body=await request.json();if(Object.keys(body).some(key=>!['id','checksum'].includes(key))||!/^[-0-9a-f]{36}$/.test(body.id)||!/^[-0-9a-f]{64}$/.test(body.checksum))throw new Error('INVALID')
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)throw new Error('AUTH_REQUIRED')
  const data=await finalizeMedia({token,id:body.id,checksum:body.checksum},process.env)
  return Response.json({ok:true,data},{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){const code=error instanceof Error?error.message:'UNAVAILABLE';return Response.json({ok:false,code:['AUTH_REQUIRED','NOT_FOUND'].includes(code)?code:'INVALID'},{status:code==='AUTH_REQUIRED'?401:code==='NOT_FOUND'?404:400,headers:{'Cache-Control':'private, no-store'}})}
}
