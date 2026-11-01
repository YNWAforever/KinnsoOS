import {discoveryRequest} from '../../../../lib/discovery/server';
export const POST=(request:Request)=>discoveryRequest(request,'read');
