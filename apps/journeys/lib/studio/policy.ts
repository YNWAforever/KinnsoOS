import type {StudioCommand,StudioEnvelope} from './contracts';
export const studioUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('INVALID');return value as Record<string,unknown>;}
function text(value:unknown,max:number,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||value.includes('\0'))throw Error('INVALID');}
function revision(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0)throw Error('INVALID');}
function id(value:unknown){if(!studioUuid(value))throw Error('INVALID');}
function ids(value:unknown,max=20){if(!Array.isArray(value)||value.length>max||new Set(value).size!==value.length)throw Error('INVALID');value.forEach(id);}
export function parseStudioCommand(value:unknown):StudioEnvelope<StudioCommand>{
 const envelope=object(value,['requestId','expectedRevision','payload']);id(envelope.requestId);revision(envelope.expectedRevision);
 const command=object(envelope.payload,['kind','targetId','data']);id(command.targetId);
 const fields:Record<string,string[]>={createThread:['title','topic','templateId'],appendMessage:['body','sourceIds'],archiveThread:[],saveSource:['threadId','title','text','rights','attested'],restrictSource:[],saveArtifact:['threadId','brief'],prepareGuideSave:['artifactId','artifactRevision','guideId','expectedGuideRevision','domainRequestId','selectedBlockIds','confirmed','editedPayload'],prepareGuidePublish:['guideId','expectedGuideRevision','domainRequestId','confirmed']};
 if(typeof command.kind!=='string'||!Object.hasOwn(fields,command.kind))throw Error('INVALID');
 const data=object(command.data,fields[command.kind]);
 if(command.kind==='createThread'){text(data.title,200);if(data.topic!=='creation'||typeof data.templateId!=='string'||!/^C[1-5]$/.test(data.templateId))throw Error('INVALID');}
 if(command.kind==='appendMessage'){text(data.body,8000);ids(data.sourceIds);}
 if(command.kind==='saveSource'){id(data.threadId);text(data.title,200);text(data.text,16000);if(!['own','unknown'].includes(String(data.rights))||typeof data.attested!=='boolean'||data.rights==='own'&&!data.attested)throw Error('INVALID');}
 if(command.kind==='saveArtifact'){
  id(data.threadId);const brief=object(data.brief,['id','threadId','revision','title','city','summary','blocks']);
  if(brief.id!==command.targetId||brief.threadId!==data.threadId||brief.revision!==envelope.expectedRevision)throw Error('INVALID');
  text(brief.title,200,true);text(brief.city,120,true);text(brief.summary,4000,true);
  if(!Array.isArray(brief.blocks)||brief.blocks.length>20)throw Error('INVALID');
  const seen=new Set<string>();
  for(const raw of brief.blocks){const b=object(raw,['id','title','text','sources','intendedUse']);id(b.id);if(seen.has(String(b.id)))throw Error('INVALID');seen.add(String(b.id));text(b.title,200,true);text(b.text,4000,true);if(!['private','public-candidate'].includes(String(b.intendedUse))||!Array.isArray(b.sources)||b.sources.length<1||b.sources.length>20)throw Error('INVALID');
   for(const rawRef of b.sources){const ref=object(rawRef,['sourceId','version','aclVersion','hash']);id(ref.sourceId);revision(ref.version);revision(ref.aclVersion);if(Number(ref.version)<1||Number(ref.aclVersion)<1||typeof ref.hash!=='string'||!/^[a-f0-9]{64}$/.test(ref.hash))throw Error('INVALID');}
  }
 }
 if(command.kind.startsWith('prepareGuide')){id(data.guideId);id(data.domainRequestId);revision(data.expectedGuideRevision);if(data.confirmed!==true)throw Error('INVALID');
  if(command.kind==='prepareGuideSave'){id(data.artifactId);revision(data.artifactRevision);ids(data.selectedBlockIds);if(Number(data.artifactRevision)<1)throw Error('INVALID');if(data.editedPayload!==undefined)object(data.editedPayload,['title','city','summary','content']);}
 }
 if(JSON.stringify(value).length>131072)throw Error('INVALID');
 return value as StudioEnvelope<StudioCommand>;
}
export function authorizeStudio(actor:{id:string;roles:string[]}|null,command:Pick<StudioCommand,'kind'>,handoffReady:boolean):boolean{
 if(!actor)return false;
 return !command.kind.startsWith('prepareGuide')||(handoffReady&&actor.roles.includes('creator'));
}
