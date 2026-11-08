import {studioRead} from '../../../../../lib/studio/server';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){return studioRead(request,'request',(await ctx.params).id);}
