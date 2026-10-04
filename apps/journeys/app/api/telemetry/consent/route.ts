import {NextResponse} from 'next/server';
import {sameOrigin,object} from '../../../../lib/api/validation';
import {boundedBody,failure} from '../../../../lib/api/server';
import {capabilities} from '../../../../lib/contracts/capabilities';
export async function POST(request:Request){
 if(!sameOrigin(request,process.env.KINNSO_SITE_URL))return failure('FORBIDDEN',403);
 if(capabilities(process.env).telemetry.mode!=='connected')return failure('UNAVAILABLE',503);
 try{const value=object(await boundedBody(request,1024),['accepted']);if(typeof value.accepted!=='boolean')return failure('INVALID',400);
 const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});response.cookies.set('kinnso-analytics-consent',value.accepted?'v1:accepted':'v1:denied',{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:7*86400});return response;
 }catch{return failure('INVALID',400);}
}
