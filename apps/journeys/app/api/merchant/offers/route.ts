import {createHmac,timingSafeEqual} from 'node:crypto';
import {apiContext,backendFailure,boundedBody,failure,reply} from '../../../../lib/api/server';
import {object,uuid} from '../../../../lib/api/validation';
import {isActiveMerchantOwner} from '../../../../lib/merchants/offer-authorization';
import {parseMerchantOffer} from '../../../../lib/merchants/offers';

const columns='id,title,terms,discount_kind,discount_value,commission_kind,commission_value,valid_from,valid_to,per_visitor_limit,total_cap,claimed_count,redeemed_count,status,created_at,updated_at';
const project=(row:Record<string,unknown>)=>({id:row.id,title:row.title,terms:row.terms,discountKind:row.discount_kind,discountValue:row.discount_value,commissionKind:row.commission_kind,commissionValue:row.commission_value,validFrom:row.valid_from,validTo:row.valid_to,perVisitorLimit:row.per_visitor_limit,totalCap:row.total_cap,claimedCount:row.claimed_count,redeemedCount:row.redeemed_count,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at});
const pageSize=25;
const timestamp=/^\d{4,6}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const cursorPattern=/^[A-Za-z0-9_-]{1,116}\.[A-Za-z0-9_-]{43}$/;
const cursorKey=()=>[process.env.KINNSO_AUTH_RECOVERY_SECRET,process.env.KINNSO_SUPABASE_SECRET_KEY].find(key=>key&&key.length>=32);
const encode=(id:string,createdAt:string)=>Buffer.from(JSON.stringify([id,createdAt])).toString('base64url');
const tag=(key:string,actor:string,company:string,value:string)=>createHmac('sha256',key)
 .update('kinnso-merchant-offers-v1:'+actor+':'+company+':'+value).digest('base64url');

function companyQuery(request:Request){
 const params=new URL(request.url).searchParams,company=params.get('company'),token=params.get('cursor');
 if(!uuid(company)||[...params.keys()].some(key=>(key!=='company'&&key!=='cursor')||params.getAll(key).length!==1)||
    (token!==null&&!cursorPattern.test(token)))return null;
 return {company:company.toLowerCase(),token};
}

function readCursor(token:string,key:string,actor:string,company:string){
 const [value,signature]=token.split('.');
 if(!timingSafeEqual(Buffer.from(signature),Buffer.from(tag(key,actor,company,value))))return null;
 try{
  const tuple:unknown=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  if(!Array.isArray(tuple)||tuple.length!==2)return null;
  const [id,createdAt]=tuple;
  if(!uuid(id)||id!==id.toLowerCase()||typeof createdAt!=='string'||!timestamp.test(createdAt)||encode(id,createdAt)!==value)return null;
  return {id,createdAt};
 }catch{return null;}
}

export async function GET(request:Request){
 const parsed=companyQuery(request);if(!parsed)return failure('INVALID',400);
 const {company,token}=parsed;
 const ctx=await apiContext(request,'merchant');if(ctx.response)return ctx.response;
 if(!await isActiveMerchantOwner(ctx.client,ctx.actor,company))return failure('FORBIDDEN',403);
 try{
  const key=cursorKey(),actor=ctx.actor.id;
  let query=ctx.client.from('merchant_offers').select(columns).eq('merchant_profile_id',company);
  if(token){
   if(!key)return failure('UNAVAILABLE',503);
   const cursor=readCursor(token,key,actor,company);
   if(!cursor)return failure('INVALID',400);
   const {id,createdAt}=cursor;
   query=query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
  }
  const [result,totals]=await Promise.all([
   query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(pageSize+1),
   ctx.client.rpc('get_merchant_offer_totals',{p_merchant_id:company}),
  ]);
  if(result.error)return backendFailure(result.error);
  if(totals.error)return backendFailure(totals.error);
  const summary=totals.data;
  if(!summary||!Number.isSafeInteger(summary.claimed)||summary.claimed<0||!Number.isSafeInteger(summary.redeemed)||summary.redeemed<0)
   return failure('UNAVAILABLE',503);
  const rows=(result.data??[]) as Record<string,unknown>[],visible=rows.slice(0,pageSize),last=visible.at(-1);
  let nextCursor:string|null=null;
  if(rows.length>pageSize&&last){
   if(!key||!uuid(last.id)||typeof last.created_at!=='string'||!timestamp.test(last.created_at))return failure('UNAVAILABLE',503);
   const value=encode(last.id.toLowerCase(),last.created_at);
   nextCursor=value+'.'+tag(key,actor,company,value);
  }
  return reply({ok:true,data:{items:visible.map(project),summary,nextCursor,truncated:nextCursor!==null}});
 }catch{return failure('UNAVAILABLE',503);}
}
export async function POST(request:Request){
 const ctx=await apiContext(request,'merchant',true);if(ctx.response)return ctx.response;
 let requestId:string,company:string,parsed:ReturnType<typeof parseMerchantOffer>;
 try{const body=object(await boundedBody(request,32768),['requestId','company','input']);if(!uuid(body.requestId)||!uuid(body.company))return failure('INVALID',400);requestId=body.requestId;company=body.company;parsed=parseMerchantOffer(body.input);}catch{return failure('INVALID',400);}
 if(!await isActiveMerchantOwner(ctx.client,ctx.actor,company))return failure('FORBIDDEN',403);
 try{
  const result=await ctx.client.from('merchant_offers').insert({id:requestId,merchant_profile_id:company,mission_id:parsed.missionId,title:parsed.title,terms:parsed.terms,discount_kind:parsed.discountKind,discount_value:parsed.discountValue,commission_kind:parsed.commissionKind,commission_value:parsed.commissionValue,valid_from:parsed.validFrom,valid_to:parsed.validTo,per_visitor_limit:parsed.perVisitorLimit,total_cap:parsed.totalCap}).select('id,title,status').single();
  if(!result.error)return reply({ok:true,data:result.data},201);
  if(result.error.code!=='23505')return backendFailure(result.error);
  const existing=await ctx.client.from('merchant_offers').select('id,title,status').eq('id',requestId).eq('merchant_profile_id',company).maybeSingle();
  if(existing.error)return backendFailure(existing.error);
  return existing.data?reply({ok:true,data:existing.data}):failure('CONFLICT',409);
 }catch{return failure('UNAVAILABLE',503);}
}
