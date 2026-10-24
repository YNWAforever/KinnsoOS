import type {CreatorMissionDetail} from '../creators/collaboration';
export type EvidenceTimelineEntry={key:string;at:string|null;kind:'submission'|'review';status:string;note:string|null;submissionId:string};
/** Loaded authorised records only; the DTO does not preserve every resubmission event. */
export function evidenceTimeline(detail:CreatorMissionDetail):EvidenceTimelineEntry[]{
 const entries=new Map<string,EvidenceTimelineEntry>();
 const time=(value:string|null)=>value&&Number.isFinite(Date.parse(value))?value:null;
 for(const submission of detail.submissions){
  const key=`submission:${submission.id}`;
  entries.set(key,{key,at:time(submission.submittedAt),kind:'submission',status:submission.status,note:submission.notes,submissionId:submission.id});
  for(const review of submission.reviews){const key=`review:${submission.id}:${review.id}`;
   entries.set(key,{key,at:time(review.createdAt),kind:'review',status:review.action,note:review.reason,submissionId:submission.id});
  }
 }
 return [...entries.values()].sort((a,b)=>a.at===null?(b.at===null?a.key.localeCompare(b.key):1):b.at===null?-1:Date.parse(a.at)-Date.parse(b.at)||a.key.localeCompare(b.key));
}
