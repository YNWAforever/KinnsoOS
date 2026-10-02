import {currentActor} from '../../../lib/auth/actor';
import {reply} from '../../../lib/api/server';
export async function GET(){const actor=await currentActor();return reply({ok:true,data:actor?{id:actor.id}:null})}
