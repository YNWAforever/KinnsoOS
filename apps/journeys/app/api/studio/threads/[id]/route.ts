import {studioRead} from '../../../../../lib/studio/server';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){return studioRead(request,'thread',(await ctx.params).id);}
