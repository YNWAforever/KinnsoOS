const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function adoptionPath(locale:string,guideId:string,tripId?:string,flowId?:string,version?:number,creationId?:string){
 const language=locale==='zh-HK'?'zh-HK':'en';
 if(!uuid.test(guideId)||(tripId!==undefined&&!uuid.test(tripId))||(flowId!==undefined&&!uuid.test(flowId))||(version!==undefined&&(!Number.isSafeInteger(version)||version<1))||(creationId!==undefined&&!uuid.test(creationId)))throw Error('INVALID_ADOPTION');
 return`/${language}/g/${guideId}?`+new URLSearchParams({adopt:'1',...tripId?{trip:tripId}:{},...flowId?{flow:flowId}:{},...version?{version:String(version)}:{},...creationId?{creation:creationId}:{}});
}
export function parseAdoptionPath(value:unknown,locale:string):{guideId:string;tripId:string|null;flowId:string|null;version?:number;creationId?:string}|null{
 if(typeof value!=='string'||value.length>512||!value.startsWith('/'))return null;
 const language=locale==='zh-HK'?'zh-HK':'en',match=value.match(new RegExp('^/'+language+'/g/([0-9a-f-]{36})\\?([^#]+)$','i'));
 if(!match||!uuid.test(match[1]))return null;
 const params=new URLSearchParams(match[2]);
 if(params.get('adopt')!=='1'||[...params.keys()].some(key=>!['adopt','trip','flow','version','creation'].includes(key)||params.getAll(key).length!==1))return null;
 const tripId=params.get('trip'),flowId=params.get('flow');
 if(tripId!==null&&!uuid.test(tripId)||flowId!==null&&!uuid.test(flowId))return null;
 const version=params.get('version'),creationId=params.get('creation');
 if(version!==null&&(!/^[1-9]\d*$/.test(version)||!Number.isSafeInteger(Number(version)))||creationId!==null&&!uuid.test(creationId))return null;
 return{guideId:match[1],tripId,flowId,...version?{version:Number(version)}:{},...creationId?{creationId}:{}};
}
export function afterTripCreation(next:unknown,tripId:string,locale:string,creationId?:string){
 const parsed=parseAdoptionPath(next,locale);
 return parsed?adoptionPath(locale,parsed.guideId,tripId,parsed.flowId??undefined,parsed.version,creationId??parsed.creationId):`/${locale==='zh-HK'?'zh-HK':'en'}/trips/${tripId}`;
}
