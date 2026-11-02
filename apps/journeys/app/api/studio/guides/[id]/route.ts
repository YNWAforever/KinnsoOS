import {studioRead} from '../../../../../lib/studio/server';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){return studioRead(request,'guide',(await ctx.params).id);}
