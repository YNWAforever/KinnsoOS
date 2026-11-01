import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {ownedRunDirectory} from './live-support.mjs';
import {Blocked,gate} from './target.mjs';

export function createStageStore(root){
  const filename=plan=>path.join(ownedRunDirectory(root,plan.runId),'stage-state.json');
  const read=async plan=>{
    try{
      const data=JSON.parse(await readFile(filename(plan),'utf8'));
      gate(data.runId===plan.runId,'RUN_STATE_OWNER_MISMATCH');return data;
    }catch(e){if(e.code==='ENOENT')return {};throw e instanceof Blocked?e:new Blocked('RUN_STATE_UNREADABLE');}
  };
  const write=async(plan,patch)=>{
    const file=filename(plan),before=await read(plan);
    await mkdir(path.dirname(file),{recursive:true,mode:0o700});
    const next={...before,...patch,runId:plan.runId,updatedAt:new Date().toISOString()},temp=file+'.'+randomUUID()+'.tmp';
    try{
      await writeFile(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'});
      await rename(temp,file);
    }finally{await rm(temp,{force:true});}
    return next;
  };
  return Object.freeze({read,write});
}
