export type ReminderCandidate={participantId:string;milestoneId:string;deadlineVersion:string;eventKind:'collaboration.due_soon'|'collaboration.overdue'};
export type ReminderPage={items:ReminderCandidate[];nextCursor:string|null};
export type ReminderPort={due:(query:{now:string;after:string|null;limit:number})=>Promise<ReminderPage>;emit:(candidate:ReminderCandidate,now:string)=>Promise<{emitted:boolean}>};
export async function dueCollaborationReminders(now:string,after:string|null,limit:number,port:ReminderPort){
 if(!Number.isFinite(Date.parse(now))||!Number.isInteger(limit)||limit<1||limit>50||after!==null&&(typeof after!=='string'||!after||after.length>100))throw Error('INVALID');
 const page=await port.due({now,after,limit});if(!page||!Array.isArray(page.items)||page.items.length>limit||page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!page.nextCursor||page.nextCursor.length>100))throw Error('INVALID');return page;
}
export async function runCollaborationReminders(now:string,port:ReminderPort,{limit=50,maxPages=4,after=null,budgetMs=15000,clock=Date.now}:{limit?:number;maxPages?:number;after?:string|null;budgetMs?:number;clock?:()=>number}={}){
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>10||!Number.isFinite(budgetMs)||budgetMs<1||budgetMs>20000)throw Error('INVALID');const stopAt=clock()+budgetMs;let cursor=after,scanned=0,emitted=0;const seen=new Set<string>();if(cursor)seen.add(cursor);
 for(let i=0;i<maxPages;i++){if(clock()>=stopAt)return{completed:false,scanned,emitted,nextCursor:cursor};const page=await dueCollaborationReminders(now,cursor,limit,port);for(const candidate of page.items){if(clock()>=stopAt)return{completed:false,scanned,emitted,nextCursor:cursor};scanned++;if((await port.emit(candidate,now)).emitted)emitted++;}cursor=page.nextCursor;if(!cursor)return{completed:true,scanned,emitted,nextCursor:null};if(seen.has(cursor))throw Error('INVALID');seen.add(cursor);}
 return{completed:false,scanned,emitted,nextCursor:cursor};
}
export function collaborationNotice(type:string,locale:string){const labels:Record<string,[string,string]>={
 'collaboration.due_soon':['Work is due within 24 hours','合作工作將於 24 小時內截止'],
 'collaboration.overdue':['Work is overdue; review your next step','合作工作已逾期；請核對下一步'],
 'collaboration.invited':['Invitation to collaborate','收到合作邀請'],
 'collaboration.application_approved':['Application accepted','合作申請已獲接納'],
 'collaboration.application_rejected':['Application not accepted','合作申請未獲接納'],
 'submission.revision_requested':['Changes requested for submitted work','已提交工作需要修改'],
 'submission.approved':['Submitted work approved','已提交工作獲批'],
 'submission.rejected':['Submitted work not approved','已提交工作未獲批']};return labels[type]?.[locale==='zh-HK'?1:0]??type;}
