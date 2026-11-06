import {apiContext,backendFailure,failure,reply} from '../../../../lib/api/server';
import {uuid} from '../../../../lib/api/validation';

const views=new Set(['overview','analytics','creators','merchants','missions','sessions','team','perks','testimonials','users','payouts','bookings']);
const gated=new Set(['payouts','bookings']);
const columns={
 missions:'id,title,status,starts_at,application_closes_at,created_at,merchant_profile_id',
 sessions:'id,title,status,starts_at,host_creator_id,created_at',
 perks:'id,title,partner_name,active,min_tier,redemption_type,created_at',
 testimonials:'id,quote,author_name,author_role,locale,status,sort_order,created_at',
} as const;

export async function GET(request:Request){
 const url=new URL(request.url),params=url.searchParams;
 if([...params.keys()].some(key=>!['view','id'].includes(key)||params.getAll(key).length!==1))return failure('INVALID',400);
 const view=params.get('view')??'overview',id=params.get('id');
 if(!views.has(view)||(id!==null&&!uuid(id)))return failure('INVALID',400);
 const ctx=await apiContext(request,'ops');if(ctx.response)return ctx.response;
 if(!ctx.actor.roles.includes('ops'))return failure('FORBIDDEN',403);
 if(gated.has(view))return reply({ok:true,data:{view,status:'GATED',reason:'PROVIDER_OR_FINANCIAL_ACTION_GATED',items:[]}});
 try{
  if(view==='overview'||view==='analytics'){
   const result=await ctx.client.rpc('admin_overview_counts');
   if(result.error)return backendFailure(result.error);
   return reply({ok:true,data:{view,counts:Array.isArray(result.data)?result.data[0]:result.data}});
  }
  if(view==='creators'){
   if(id){const result=await ctx.client.rpc('admin_creator_detail',{p_creator_id:id});return result.error?backendFailure(result.error):reply({ok:true,data:{view,detail:result.data}});}
   const result=await ctx.client.rpc('admin_search_creators',{p_search:null,p_statuses:null,p_tiers:null,p_dna:null,p_verified:null,p_limit:25,p_cursor_created_at:null,p_cursor_id:null});
   return result.error?backendFailure(result.error):reply({ok:true,data:{view,items:result.data??[]}});
  }
  if(view==='merchants'){
   if(id){const result=await ctx.client.rpc('admin_merchant_detail',{p_merchant_id:id});return result.error?backendFailure(result.error):reply({ok:true,data:{view,detail:result.data}});}
   const result=await ctx.client.rpc('admin_search_merchants',{p_search:null,p_statuses:null,p_tiers:null,p_limit:25,p_cursor_created_at:null,p_cursor_id:null});
   return result.error?backendFailure(result.error):reply({ok:true,data:{view,items:result.data??[]}});
  }
  if(view==='team'||view==='users'){
   const result=await ctx.client.rpc('admin_list_ops_members');
   return result.error?backendFailure(result.error):reply({ok:true,data:{view,items:result.data??[]}});
  }
  const table=view==='missions'?'missions':view==='sessions'?'community_sessions':view==='perks'?'partner_perks':view==='testimonials'?'testimonials':null;
  if(!table)return failure('INVALID',400);
  const selected=columns[view as keyof typeof columns];
  const query=ctx.client.from(table).select(selected);
  if(id){const result=await query.eq('id',id).maybeSingle();return result.error?backendFailure(result.error):reply({ok:true,data:{view,detail:result.data}});}
  const result=await query.order('created_at',{ascending:false}).limit(25);
  return result.error?backendFailure(result.error):reply({ok:true,data:{view,items:result.data??[]}});
 }catch{return failure('UNAVAILABLE',503);}
}
