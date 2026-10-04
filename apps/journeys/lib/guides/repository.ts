import { request } from '../trips/repository';
import type {PublicGuide} from '../seo/public-guide';
export const guides={get:(id:string)=>request<PublicGuide>('/api/guides/'+encodeURIComponent(id))};
