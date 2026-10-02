import { request } from '../trips/repository';
import type { GuideSnapshot,GuideSummary } from '../contracts/trips';
export const guides={get:(id:string)=>request<GuideSnapshot|GuideSummary>('/api/guides/'+encodeURIComponent(id))};
