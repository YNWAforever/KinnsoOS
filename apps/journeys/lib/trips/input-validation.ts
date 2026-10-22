/** The existing validateTrip calendar round-trip and Intl zone rules, without demo-only fields. */
export function tripScheduleIssue(timezone:unknown,startDate:unknown):'date'|'timezone'|null {
 if(typeof timezone!=='string'||!timezone||timezone.length>80)return'timezone';
 try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{return'timezone';}
 if(startDate!==null&&startDate!==undefined&&startDate!==''){
  if(typeof startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!Number.isFinite(Date.parse(startDate))||new Date(startDate).toISOString().slice(0,10)!==startDate)return'date';
 }
 return null;
}
export const tripScheduleErrors:Record<'date'|'timezone',readonly[string,string]>={
 date:['Choose a valid calendar date (YYYY-MM-DD). Your input is kept.','請選擇有效日期（YYYY-MM-DD），輸入已保留。'],
 timezone:['Choose a valid time zone, such as Asia/Hong_Kong. Your input is kept.','請填寫有效時區，例如 Asia/Hong_Kong，輸入已保留。'],
} as const;
