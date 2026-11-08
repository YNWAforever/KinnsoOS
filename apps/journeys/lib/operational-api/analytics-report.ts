const WEEK_MS=7*24*60*60*1000;
const timestamp=/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;

function parseTimestamp(value:string|null){
 if(value===null)return undefined;
 if(!timestamp.test(value))return null;
 const time=Date.parse(value);
 return Number.isFinite(time)?new Date(time).toISOString():null;
}

export function analyticsWindow(params:URLSearchParams,now=new Date()){
 if([...params.keys()].some(key=>!['from','to'].includes(key)||params.getAll(key).length!==1))return null;
 const parsedFrom=parseTimestamp(params.get('from')),parsedTo=parseTimestamp(params.get('to'));
 if(parsedFrom===null||parsedTo===null)return null;
 const to=parsedTo??now.toISOString(),from=parsedFrom??new Date(now.getTime()-WEEK_MS).toISOString();
 const duration=Date.parse(to)-Date.parse(from);
 return duration>0&&duration<=WEEK_MS?{from,to}:null;
}

export function projectAnalyticsReport(rows:unknown[],window:{from:string;to:string}){
 return {
  ...window,
  timezone:'UTC' as const,
  attributionWindowDays:7 as const,
  rows:rows.map(value=>{
   const row=value as Record<string,unknown>;
   return {
    metricKey:String(row.metric_key??''),
    locale:String(row.locale??''),
    entityType:row.entity_type===null?null:String(row.entity_type??''),
    bookingState:String(row.booking_state??''),
    numerator:Number(row.numerator),
    denominator:Number(row.denominator),
    rate:row.rate===null?null:Number(row.rate),
    sampleCount:Number(row.sample_count),
    status:String(row.status??''),
    attributionWindowDays:Number(row.attribution_window_days),
   };
  }),
 };
}
