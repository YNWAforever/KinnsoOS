// The server validates the same fields again inside the atomic database command.
export type CampaignInput={title:string;summary:string;couponCode:string;couponUrl:string;affiliateRate:number|null;kinnsoRate:number|null;creatorRate:number|null;requirements:string[];deliverables:string[];milestones:{id:string;title:string;description:string;dueAt:string|null}[]};
export type CampaignCommand=
 |{type:'createDraft';id:string;input:CampaignInput;publish:boolean;reason:string}
 |{type:'updateDraft';id:string;expectedUpdatedAt:string;input:CampaignInput;reason:string}
 |{type:'publish'|'close';id:string;expectedUpdatedAt:string;reason:string}
 |{type:'reviewApplication';id:string;expectedUpdatedAt:string;action:'approve'|'reject';note:string;reason:string}
 |{type:'reviewSubmission';id:string;expectedUpdatedAt:string;action:'approve'|'reject'|'request_revision';feedback:string;reason:string}
 |{type:'setBranch';id:string;expectedActive:boolean;expectedName:string;name:string;active:boolean;reason:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
function record(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(key=>!keys.includes(key)))throw Error('INVALID');return v as Record<string,unknown>;}
const string=(v:unknown,max:number,required=false)=>typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0);
export function campaignLink(value:unknown):value is string {if(typeof value!=='string'||value.length>2048)return false;try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password&&!/\s/.test(value);}catch{return false;}}
function input(v:unknown,publish:boolean){const d=record(v,['title','summary','couponCode','couponUrl','affiliateRate','kinnsoRate','creatorRate','requirements','deliverables','milestones']);
 if(!string(d.title,120,true)||!string(d.summary,5000,publish)||!string(d.couponCode,200,publish)||!string(d.couponUrl,2048,publish)||(d.couponUrl!==''&&!campaignLink(d.couponUrl)))throw Error('INVALID');
 for(const key of ['affiliateRate','kinnsoRate','creatorRate']){const rate=d[key];if(rate===null&&!publish)continue;if(typeof rate!=='number'||!Number.isFinite(rate)||rate<0||rate>999999.99||Math.abs(rate*100-Math.round(rate*100))>1e-7)throw Error('INVALID');}
 for(const key of ['requirements','deliverables'])if(!Array.isArray(d[key])||d[key].length>20||d[key].some(value=>!string(value,1000,true)))throw Error('INVALID');
 if(!Array.isArray(d.milestones)||d.milestones.length>20||(publish&&d.milestones.length===0))throw Error('INVALID');
 const ids=new Set();for(const value of d.milestones){const m=record(value,['id','title','description','dueAt']);if(!uuid(m.id)||ids.has(m.id)||!string(m.title,120,publish)||!string(m.description,2000,publish)||(m.dueAt!==null&&!timestamp(m.dueAt)))throw Error('INVALID');ids.add(m.id);}
 return d;
}
export function campaignCommand(value:unknown):CampaignCommand {
 const c=record(value,['type','id','input','publish','expectedUpdatedAt','action','note','feedback','reason','expectedActive','expectedName','name','active']);
 if(!uuid(c.id)||!string(c.reason,2000,true))throw Error('INVALID');
 switch(c.type){
 case 'createDraft':record(c,['type','id','input','publish','reason']);if(typeof c.publish!=='boolean')throw Error('INVALID');input(c.input,c.publish);break;
 case 'updateDraft':record(c,['type','id','input','expectedUpdatedAt','reason']);input(c.input,false);if(!timestamp(c.expectedUpdatedAt))throw Error('INVALID');break;
 case 'publish':case 'close':record(c,['type','id','expectedUpdatedAt','reason']);if(!timestamp(c.expectedUpdatedAt))throw Error('INVALID');break;
 case 'reviewApplication':record(c,['type','id','expectedUpdatedAt','action','note','reason']);if(!timestamp(c.expectedUpdatedAt)||!['approve','reject'].includes(String(c.action))||!string(c.note,2000,true))throw Error('INVALID');break;
 case 'reviewSubmission':record(c,['type','id','expectedUpdatedAt','action','feedback','reason']);if(!timestamp(c.expectedUpdatedAt)||!['approve','reject','request_revision'].includes(String(c.action))||!string(c.feedback,2000,true))throw Error('INVALID');break;
 case 'setBranch':record(c,['type','id','expectedActive','expectedName','name','active','reason']);if(typeof c.active!=='boolean'||typeof c.expectedActive!=='boolean'||!string(c.name,120,true)||!string(c.expectedName,120,true))throw Error('INVALID');break;
 default:throw Error('INVALID');
 }
 return c as CampaignCommand;
}
