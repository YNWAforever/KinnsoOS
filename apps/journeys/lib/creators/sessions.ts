export const SESSION_TYPES = ['destination_briefing','ask_a_creator','merchant_spotlight','new_creator_intro'] as const;
export type CreatorSessionInput = {
  title: string;
  description: string;
  type: (typeof SESSION_TYPES)[number];
  startsAt: string;
  durationMinutes: number;
  embedUrl: string;
  replayUrl: string;
  destinationTags: string[];
};
export type ParsedCreatorSession = Omit<CreatorSessionInput,'embedUrl'|'replayUrl'> & {
  embedUrl: string | null;
  replayUrl: string | null;
};

const invalid=():never=>{throw Error('INVALID_SESSION')};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const youtube=(value:string)=>{
 const input=value.trim();
 if(!input)return null;
 if(/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{6,32}$/.test(input))return input;
 let url:URL;try{url=new URL(input)}catch{return invalid()}
 if(url.username||url.password||url.searchParams.size>0&&url.hostname.replace(/^(?:www|m)\./i,'').toLowerCase()==='youtu.be')return invalid();
 const host=url.hostname.replace(/^(?:www|m)\./i,'').toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
 let id:string|null=null;
 if(host==='youtube.com')id=parts[0]==='watch'?url.searchParams.get('v'):parts[0]==='shorts'||parts[0]==='embed'||parts[0]==='live'?parts[1]??null:null;
 else if(host==='youtu.be')id=parts[0]??null;
 if(!id||!/^[A-Za-z0-9_-]{6,32}$/.test(id))return invalid();
 return`https://www.youtube-nocookie.com/embed/${id}`;
};
const tags=(value:unknown)=>{
 if(!Array.isArray(value)||value.length>20)return invalid();
 const result:string[]=[],seen=new Set<string>();
 for(const raw of value){
  if(typeof raw!=='string')return invalid();
  const tag=raw.trim();if(!tag||tag.length>80)return invalid();
  const key=tag.toLocaleLowerCase('en');
  if(!seen.has(key)){seen.add(key);result.push(tag);}
 }
 return result;
};

export function parseCreatorSessionInput(value:unknown):ParsedCreatorSession {
 if(!record(value)||Object.keys(value).some(key=>!['title','description','type','startsAt','durationMinutes','embedUrl','replayUrl','destinationTags'].includes(key)))return invalid();
 const title=typeof value.title==='string'?value.title.trim():'';
 const description=typeof value.description==='string'?value.description.trim():'';
 const type=value.type;
 const startsAt=typeof value.startsAt==='string'?new Date(value.startsAt):new Date(NaN);
 const duration=value.durationMinutes;
 const embed=typeof value.embedUrl==='string'?value.embedUrl:'';
 const replay=typeof value.replayUrl==='string'?value.replayUrl:'';
 if(!title||title.length>160||!description||description.length>8000||!SESSION_TYPES.includes(type as CreatorSessionInput['type'])||
  Number.isNaN(startsAt.getTime())||!Number.isInteger(duration)||Number(duration)<=0||Number(duration)>1440||
  typeof value.embedUrl!=='string'||typeof value.replayUrl!=='string')return invalid();
 return {title,description,type:type as CreatorSessionInput['type'],startsAt:startsAt.toISOString(),durationMinutes:Number(duration),
  embedUrl:youtube(embed),replayUrl:youtube(replay),destinationTags:tags(value.destinationTags)};
}

export function canSetSessionStatus(current:string,row:{embedUrl:string|null},next:string){
 if(next==='live')return current==='scheduled'&&Boolean(row.embedUrl);
 if(next==='ended'||next==='cancelled')return current==='scheduled'||current==='live';
 return false;
}

export function sessionSlug(title:string,suffix:string){
 const base=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'session';
 return base+'-'+suffix;
}
