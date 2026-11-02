import {studioRead} from '../../../../lib/studio/server';
export const GET=(request:Request)=>studioRead(request,'list');
