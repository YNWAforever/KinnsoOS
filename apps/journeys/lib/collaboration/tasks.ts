import type {CreatorMission,CreatorMissionDetail} from '../creators/collaboration';
import type {CampaignDirectory} from '../merchants/campaign-repository';
import type {MerchantOnboarding} from '../merchants/onboarding';

export type ActionKind='respond-invite'|'continue'|'deliver'|'revise'|'await-review'|'completed'|'draft-campaign'|'review-application'|'review-delivery'|'setup-merchant'|'await-merchant-review'|'revise-merchant-application'|'open-company';
export type NextAction={kind:ActionKind;entityId:string;title:string;dueAt:string|null;href:string;priority:number};
type CreatorTaskRecord=Pick<CreatorMission,'id'|'title'|'participant'>&Partial<Pick<CreatorMissionDetail,'milestones'|'submissions'>>;
const uuid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const language=(locale:string)=>locale==='zh-HK'?'zh-HK':'en';
const ordered=(actions:NextAction[])=>actions.sort((a,b)=>a.priority-b.priority||(a.dueAt??'9999').localeCompare(b.dueAt??'9999')||a.entityId.localeCompare(b.entityId));

/** Selects actions from already authorized, bounded records; never fetches proofs. */
export function creatorTasks(items:CreatorTaskRecord[],locale:string):NextAction[]{
 const actions:NextAction[]=[];
 for(const item of items){
  if(!uuid(item.id)||!item.participant)continue;
  const href=`/${language(locale)}/studio/missions/${item.id}`;
  const add=(kind:ActionKind,priority:number,title=item.title,entityId=item.id,dueAt:string|null=null)=>actions.push({kind,priority,title,entityId,dueAt,href});
  if(item.participant.status==='invited')add('respond-invite',0);
  else if(item.participant.status==='applied')add('await-review',3);
  else if(item.participant.status==='completed')add('completed',4);
  else if(item.participant.status==='active'){
   if(!item.milestones?.length){add('continue',1);continue;}
   for(const milestone of item.milestones){
    if(!uuid(milestone.id))continue;
    const evidence=item.submissions?.find(s=>s.milestoneId===milestone.id);
    const kind=evidence?.status==='revision_requested'?'revise':evidence?.status==='submitted'?'await-review':evidence?.status==='approved'?'completed':'deliver';
    add(kind,kind==='revise'?0:kind==='deliver'?1:kind==='await-review'?3:4,`${item.title} · ${milestone.title}`,milestone.id,milestone.dueAt);
   }
  }
 }
 return ordered(actions);
}

export function campaignTasks(directory:CampaignDirectory,locale:string,actorId:string):NextAction[]{
 if(!uuid(directory.merchantId)||!['owner','marketing'].includes(directory.role))return[];
 const actions:NextAction[]=[];
 const add=(kind:ActionKind,campaignId:string,entityId:string,title:string,priority:number)=>{
  if(uuid(campaignId)&&uuid(entityId))actions.push({kind,entityId,title,priority,dueAt:null,href:`/${language(locale)}/merchant?company=${directory.merchantId}&campaign=${campaignId}#merchant-campaigns`});
 };
 for(const item of directory.items)if(item.status==='draft')add('draft-campaign',item.id,item.id,item.title,1);
 const detail=directory.detail;
 if(detail){
  for(const participant of detail.participants)if(actorId&&participant.creatorId!==actorId&&participant.status==='applied')add('review-application',detail.id,participant.id,detail.title,0);
  if(directory.role==='owner'&&detail.canReviewSubmissions)for(const submission of detail.submissions)if(actorId&&submission.creatorId!==actorId&&submission.status==='submitted')add('review-delivery',detail.id,submission.id,detail.title,0);
 }
 return ordered(actions);
}

export function merchantSetupTasks(page:MerchantOnboarding,locale:string):NextAction[]{
 const href=`/${language(locale)}/merchant#merchant-onboarding`;
 if(page.merchant)return page.merchant.status==='active'&&uuid(page.merchant.id)?[{kind:'open-company',entityId:page.merchant.id,title:page.merchant.name,dueAt:null,priority:1,href:`/${language(locale)}/merchant?company=${page.merchant.id}`}]:[];
 const pending=page.applications.find(a=>a.status==='pending');
 if(pending)return[{kind:'await-merchant-review',entityId:pending.id,title:pending.companyName,dueAt:null,priority:3,href}];
 const rejected=page.applications.find(a=>a.status==='rejected');
 return[{kind:rejected?'revise-merchant-application':'setup-merchant',entityId:rejected?.id??'new',title:rejected?.companyName??'',dueAt:null,priority:1,href}];
}

export function actionGroup(action:NextAction):'mine'|'waiting'|'completed'{
 return action.kind==='completed'?'completed':['await-review','await-merchant-review'].includes(action.kind)?'waiting':'mine';
}
