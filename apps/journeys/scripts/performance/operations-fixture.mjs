import{randomUUID}from'node:crypto';import{createServerClient}from'@supabase/ssr';
const checked=r=>{if(r.error)throw Error('Owned operations fixture/read rejected: '+r.error.code);return r.data;};
export async function setupOperations({admin,creatorId,target,onActor}){
 const email='synthetic-operations-lab-'+randomUUID()+'@example.test',password='Lab!'+randomUUID();
 const merchantUser=checked(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;onActor(merchantUser.id);
 const jar=new Map(),merchantActor=createServerClient(target.apiOrigin,process.env.SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const{name,value}of values)jar.set(name,value);}}});
 const session=checked(await merchantActor.auth.signInWithPassword({email,password})).session;
 const merchantId=checked(await admin.from('merchant_profiles').insert({user_id:merchantUser.id,company_name:'Synthetic operations lab company',contact_email:email}).select('id').single()).id;
 const campaignIds=Array.from({length:55},()=>randomUUID()),title='Synthetic operations lab campaign';
 checked(await admin.from('missions').insert(campaignIds.map((id,i)=>({id,merchant_profile_id:merchantId,title:title+' '+i,summary:'Authored synthetic lab campaign',mission_type:'coupon_affiliate',mission_source:'merchant',status:'draft',coupon_code:'LAB',coupon_url:'https://example.test'}))));
 const milestoneId=checked(await admin.from('mission_milestones').insert({mission_id:campaignIds[0],title:'Synthetic lab original deliverable',description:'Provide an original lab evidence link'}).select('id').single()).id;
 checked(await admin.from('missions').update({status:'published'}).in('id',campaignIds));
 const participants=checked(await admin.from('mission_participants').insert(campaignIds.map(mission_id=>({mission_id,creator_id:creatorId,status:'active',source:'application',approved_at:new Date().toISOString()}))).select('id,mission_id'));
 checked(await admin.from('mission_milestone_submissions').insert({mission_participant_id:participants.find(p=>p.mission_id===campaignIds[0]).id,mission_milestone_id:milestoneId,status:'submitted',submitted_at:new Date().toISOString(),proof_urls:['https://example.test/synthetic-lab-original'],notes:'Explicit synthetic performance fixture'}));
 return{merchantId,merchantUserId:merchantUser.id,merchantActor,merchantLogin:{email,password},merchantClaims:JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString()),merchantCookie:()=>[...jar].map(([name,value])=>name+'='+value).join('; '),campaignId:campaignIds[0],campaignIds,title,dataset:{campaigns:55,acceptedCreatorWork:55,reviewSubmissions:1,roles:['creator','merchant_owner']}};
}
export function operationRead(operation,fixture){
 if(operation==='creatorList')return{route:'/api/creator/missions?scope=mine',rpc:'query_kinnso_creator_missions',args:{p_scope:'mine',p_query:{}},role:'creator'};
 if(operation==='creatorDetail')return{route:'/api/creator/missions/'+fixture.campaignId,rpc:'get_kinnso_creator_mission',args:{p_mission_id:fixture.campaignId,p_submission_after:null},role:'creator'};
 return{route:'/api/merchant/campaigns?id='+fixture.merchantId+(operation==='merchantReview'?'&campaignId='+fixture.campaignId:''),rpc:'query_kinnso_merchant_campaigns',args:{p_merchant_id:fixture.merchantId,p_query:{},p_campaign_id:operation==='merchantReview'?fixture.campaignId:null,p_participant_after:null,p_submission_after:null,p_branch_after:null},role:'merchant_owner'};
}
export function verifyOperation(operation,data,fixture){
 if(operation==='creatorDetail'){if(data?.id!==fixture.campaignId||!Array.isArray(data.submissions)||data.submissions.length!==1)throw Error('Creator detail identity/evidence mismatch');return;}
 if(!Array.isArray(data?.items)||data.items.length!==20||data.items.some(row=>!fixture.campaignIds.includes(row.id))||!data.nextCursor)throw Error('Bounded scoped collaboration list mismatch');
 if(operation.startsWith('merchant')&&data.summary?.published!==55)throw Error('Whole company baseline count mismatch');
 if(operation==='merchantReview'&&(data.detail?.id!==fixture.campaignId||data.detail.submissions?.length!==1))throw Error('Merchant review identity/evidence mismatch');
}
export async function cleanupOperations(admin,fixture){
 if(!fixture?.merchantId)return;
 checked(await admin.from('merchant_profiles').delete().eq('id',fixture.merchantId));
 const left=checked(await admin.from('missions').select('id').eq('merchant_profile_id',fixture.merchantId));if(left.length)throw Error('Owned operations fixture records remain');
}
