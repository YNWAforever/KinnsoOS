import {CITIES,type TripIntentInput,type DiscoveryPreferencesInput,type DateSpec,type CityDefinition} from './contracts.ts';
import {object,text,strings,integer,uuid} from './policy.ts';
export function calendarDate(value:unknown):string{const s=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('INVALID');return s;}
export function dateRange(value:DateSpec):{start:string;end:string}|null{
 if(value.kind==='undecided'){object(value,['kind']);return null;}
 const keys=value.kind==='fixed'?['kind','start','end']:value.kind==='window'?['kind','earliest','latest']:[];
 if(!keys.length)throw Error('INVALID');const v=object(value,keys),start=calendarDate(v[keys[1]]),end=calendarDate(v[keys[2]]);
 if(start>end||(Date.parse(end)-Date.parse(start))/86400000>=90)throw Error('INVALID');return {start,end};
}
export function validatePreferences(input:DiscoveryPreferencesInput):DiscoveryPreferencesInput{
 object(input,['favoriteCityKeys','interestTags','languages']);strings(input.favoriteCityKeys,20);if(input.favoriteCityKeys.some(k=>!CITIES.some(c=>c.key===k)))throw Error('UNSUPPORTED');strings(input.interestTags,10);strings(input.languages,5,['en','zh-HK','zh-TW']);return structuredClone(input);
}
export function validateTripIntent(input:TripIntentInput,city?:CityDefinition):TripIntentInput{
 object(input,['cityKey','dateSpec','budget','interestTags','languages'],['linkedTripId']);city??=CITIES.find(c=>c.key===input.cityKey);if(!city||city.key!==input.cityKey)throw Error('UNSUPPORTED');
 if(!input.dateSpec||typeof input.dateSpec!=='object')throw Error('INVALID');dateRange(input.dateSpec);strings(input.interestTags,10);strings(input.languages,5,['en','zh-HK','zh-TW']);
 if(input.budget!==null){const b=object(input.budget,['currency','maxPerPersonMinor']);if(!['HKD','TWD'].includes(String(b.currency)))throw Error('INVALID');integer(b.maxPerPersonMinor,0,100000000);}
 if(input.linkedTripId!==undefined)uuid(input.linkedTripId);return structuredClone(input);
}
export function localDate(now:Date,timeZone:string):string{return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
