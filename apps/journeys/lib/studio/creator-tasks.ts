import {publicationReadiness} from '../creators/editor-operations';
import type {GuideDraft} from '../creators/contracts';
import type {CreatorMissionDetail,EarningsPage} from '../creators/collaboration';
export function checkCreatorDraft(draft:GuideDraft){return{guideId:draft.id,revision:draft.revision,issues:publicationReadiness(draft.payload).issues,sourceChanged:draft.sourceChanged,approval:false as const,destination:'studio/guides/'+draft.id+'/edit'};}
export function reviewCreatorEarnings(page:EarningsPage,question:string,asOf:string){return{question,platform:'KinnsoOS',section:page.section,asOf,period:null,denominator:null,externalSignals:null,coverage:page.nextCursor?'partial-page':'returned-items',totals:page.totals,items:page.items,source:'/api/creator/earnings?section='+page.section,gaps:['No external platform connection','No reporting-period or denominator contract'],payoutConfirmed:page.section==='payouts'};}
export function prepareCreatorRevision(mission:CreatorMissionDetail){
 if(mission.participant?.status!=='active')return{ok:false as const,code:'FORBIDDEN' as const};
 return{ok:true as const,missionId:mission.id,requirements:mission.requirements,deliverables:mission.deliverables,feedback:mission.submissions.filter(s=>s.status==='revision_requested').map(s=>({submissionId:s.id,milestoneId:s.milestoneId,updatedAt:s.updatedAt,feedback:s.merchantFeedback})),partial:mission.milestonesTruncated||!!mission.submissionsNextCursor,destination:'studio/missions/'+mission.id,submitted:false as const};
}
export function prepareCreatorVersion(draft:GuideDraft){return{...checkCreatorDraft(draft),publishedVersion:draft.publishedVersion,changesExistingTravellerCopies:false as const,publishesAutomatically:false as const};}
