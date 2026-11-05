import{createClient}from '@supabase/supabase-js';
import{randomUUID,randomInt,randomBytes}from 'node:crypto';
import{mkdirSync,writeFileSync}from 'node:fs';
import path from 'node:path';
import{assertSafePublicEvidence,publicTargetConfiguration}from './target.mjs';

const ok=async promise=>{const result=await promise;if(result.error)throw Error('PUBLIC_FIXTURE_WRITE_FAILED '+result.error.code);return result.data};

export async function openPublicFixture(){
 const target=publicTargetConfiguration(process.env);
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.SUPABASE_URL)throw Error('PUBLIC_FIXTURE_TARGET_REQUIRED');
 if(new URL(process.env.SUPABASE_URL).origin!==target.apiOrigin)throw Error('PUBLIC_FIXTURE_TARGET_MISMATCH');
 const admin=createClient(target.apiOrigin,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const runId=randomUUID(),now=new Date();
 const stamp=runId.slice(0,8);
 const actors={};const ids={
  guides:{published:randomUUID(),draft:randomUUID()},
  experiences:{published:randomUUID(),draft:randomUUID()},
  sessions:{published:randomUUID(),cancelled:randomUUID()},
  article:randomUUID(),articleAuthor:'public-it-author-'+stamp,
 };
 for(const label of ['A','B']){
  const email=`public-content-${stamp}-${label.toLowerCase()}@example.test`,password=randomBytes(24).toString('base64url');
  const made=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(made.error)throw Error('PUBLIC_FIXTURE_USER_FAILED');
  actors[label]={id:made.data.user.id,email,password};
 }
 const creatorA={id:actors.A.id,display_name:'Synthetic Public Creator',handle:'synthetic-public-'+stamp,bio:'Synthetic public profile for destination verification.',status:'active',public_profile:{niches:['travel'],privateMarker:'DO_NOT_EXPOSE'}};
 const creatorB={id:actors.B.id,display_name:'Synthetic Save Isolation Creator',handle:'synthetic-save-'+stamp,bio:'Second owned account.',status:'active',public_profile:{niches:['travel']}};
 for(const creator of [creatorA,creatorB])await ok(admin.from('creators').update({display_name:creator.display_name,handle:creator.handle,bio:creator.bio,status:creator.status,public_profile:creator.public_profile}).eq('id',creator.id));
 const activeMerchantId=randomUUID(),suspendedMerchantId=randomUUID();
 await ok(admin.from('merchant_profiles').insert([
  {id:activeMerchantId,user_id:creatorA.id,company_name:'Synthetic Public Host',contact_name:'Synthetic Owner',contact_email:actors.A.email,slug:'synthetic-public-host-'+stamp,tagline:'Synthetic public merchant',city:'Tokyo',status:'active'},
  {id:suspendedMerchantId,user_id:creatorB.id,company_name:'Suspended Synthetic Host',contact_name:'Synthetic Owner',contact_email:actors.B.email,slug:'suspended-public-host-'+stamp,tagline:'Must stay hidden',city:'Tokyo',status:'suspended'},
 ]));
 const publishedAt=new Date(now.getTime()-86_400_000).toISOString();
 await ok(admin.from('guides').insert([
  {id:ids.guides.published,creator_id:creatorA.id,creator_handle:creatorA.handle,creator_name:creatorA.display_name,slug:'synthetic-public-guide-'+stamp,title:'Synthetic Public Guide',summary:'Synthetic destination summary.',cover_url:null,city:'Tokyo',status:'published',saves_count:0,published_at:publishedAt},
  {id:ids.guides.draft,creator_id:creatorA.id,creator_handle:creatorA.handle,creator_name:creatorA.display_name,slug:'synthetic-draft-guide-'+stamp,title:'Synthetic Draft Guide',summary:'Must stay hidden.',cover_url:null,city:'Tokyo',status:'draft',saves_count:0,published_at:null},
 ]));
 await ok(admin.from('experiences').insert([
  {id:ids.experiences.published,merchant_profile_id:activeMerchantId,slug:'synthetic-public-experience-'+stamp,title:'Synthetic Public Experience',summary:'Synthetic summary',description:'Synthetic description',city:'Tokyo',price_amount:1200,currency:'JPY',duration_minutes:90,cover_url:null,status:'published',published_at:publishedAt},
  {id:ids.experiences.draft,merchant_profile_id:activeMerchantId,slug:'synthetic-draft-experience-'+stamp,title:'Synthetic Draft Experience',summary:'Must stay hidden',description:'Must stay hidden',city:'Tokyo',price_amount:1000,currency:'JPY',duration_minutes:60,cover_url:null,status:'draft',published_at:null},
 ]));
 const startsAt=new Date(now.getTime()+7*86_400_000).toISOString();
 await ok(admin.from('community_sessions').insert([
  {id:ids.sessions.published,slug:'synthetic-public-session-'+stamp,host_creator_id:creatorA.id,title:'Synthetic Public Session',description:'Synthetic session.',type:'destination_briefing',starts_at:startsAt,duration_minutes:45,replay_url:null,destination_tags:['Tokyo'],status:'scheduled'},
  {id:ids.sessions.cancelled,slug:'synthetic-cancelled-session-'+stamp,host_creator_id:creatorA.id,title:'Synthetic Cancelled Session',description:'Must stay hidden.',type:'destination_briefing',starts_at:startsAt,duration_minutes:45,replay_url:null,destination_tags:['Tokyo'],status:'cancelled'},
 ]));
 await ok(admin.from('articles').insert({id:ids.article,legacy_post_id:-randomInt(1,2_000_000_000),url:'synthetic-public-article-'+stamp,slug:'synthetic-public-article-'+stamp,category:'destination',thumbnails:[],regions:['tokyo'],tag_slugs:['travel'],authors:[ids.articleAuthor],published_at:publishedAt,edit_at:publishedAt}));
 await ok(admin.from('article_translations').insert(['en','zh-hk','zh-tw','zh-cn','ja','ko','th'].map(locale=>({article_id:ids.article,locale,title:'Synthetic Public Article '+locale,summary:'Synthetic article summary',content:[{id:'body',type:'text',title:'Authored section',content:'<p>Durable authored article body.</p>'}],meta_title:null,meta_description:null,og_image:null}))));
 await ok(admin.from('article_authors').insert(['en','zh-hk','zh-tw','zh-cn','ja','ko','th'].map(locale=>({slug:ids.articleAuthor,locale,name:'Synthetic Article Author',bio:null,is_active:true}))));
 const ledger={runId,project:target.project,fixtureIds:{...ids,creators:{A:creatorA.id,B:creatorB.id},merchants:{active:activeMerchantId,suspended:suspendedMerchantId}},retained:false};
 const ledgerPath=process.env.KINNSO_PUBLIC_IT_LEDGER;
 if(ledgerPath){mkdirSync(path.dirname(ledgerPath),{recursive:true});writeFileSync(ledgerPath,JSON.stringify(assertSafePublicEvidence(ledger),null,2))}
 async function cleanup(){
  await admin.from('article_translations').delete().eq('article_id',ids.article);
  await admin.from('article_authors').delete().eq('slug',ids.articleAuthor);
  await admin.from('articles').delete().eq('id',ids.article);
  await admin.from('community_sessions').delete().in('id',Object.values(ids.sessions));
  await admin.from('experiences').delete().in('id',Object.values(ids.experiences));
  await admin.from('guides').delete().in('id',Object.values(ids.guides));
  await admin.from('merchant_profiles').delete().in('id',[activeMerchantId,suspendedMerchantId]);
  for(const actor of Object.values(actors))await admin.auth.admin.deleteUser(actor.id);
 }
 return{admin,actors,creator:creatorA,suspendedCreator:creatorB,merchant:{id:activeMerchantId,slug:'synthetic-public-host-'+stamp},suspendedMerchant:{id:suspendedMerchantId,slug:'suspended-public-host-'+stamp},ids:{...ids,experienceSlug:'synthetic-public-experience-'+stamp,sessionSlug:'synthetic-public-session-'+stamp,articleSlug:'synthetic-public-article-'+stamp},cleanup};
}
