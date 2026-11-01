import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {Blocked} from './target.mjs';

export const repositoryRoot=fileURLToPath(new URL('../../../../',import.meta.url));
const exec=promisify(execFile);
export async function resolveCachedCli(root,{
  resolvePackage=async candidate=>createRequire(path.join(candidate,'package.json')).resolve('supabase/package.json'),
  readPackage=async file=>JSON.parse(await readFile(file,'utf8')),
  commonDirectory=async candidate=>(await exec('git',['-C',candidate,'rev-parse','--git-common-dir'],
    {timeout:10000,windowsHide:true})).stdout.trim()
}={}){
  const common=await commonDirectory(root),main=path.dirname(path.resolve(root,common));
  for(const candidate of [...new Set([root,main])]){
    try{
      const pkg=await resolvePackage(candidate),metadata=await readPackage(pkg);
      if(metadata.version==='2.107.0')return path.join(path.dirname(pkg),'dist/supabase.js');
    }catch{}
  }
  throw new Blocked('CLI_UNAVAILABLE_OR_MISMATCH');
}
