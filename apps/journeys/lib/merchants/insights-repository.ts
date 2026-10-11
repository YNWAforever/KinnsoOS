import {request}from'../trips/repository';
import type{InsightsQuery,MerchantInsightsPage}from'./insights';
function url(id:string,query:InsightsQuery,exported=false){return'/api/merchant/insights?'+new URLSearchParams({id,...query.from?{from:query.from,to:query.to!}:{},...query.campaignId?{campaign:query.campaignId}:{},...query.after&&!exported?{after:query.after}:{},...exported?{format:'csv'}:{}});}
export const merchantInsights={load:(id:string,query:InsightsQuery={})=>request<MerchantInsightsPage>(url(id,query)),export:(id:string,query:InsightsQuery)=>request<{csv:string}>(url(id,query,true))};
