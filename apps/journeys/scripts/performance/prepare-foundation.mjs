import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha='f181cff22d28a480120c2abaa2dde91c573582bf';
const destination=path.join(app,'evidence/performance/foundation');
if(existsSync(destination))throw Error('Foundation directory already exists; retain it and inspect rather than overwrite');
await mkdir(destination,{recursive:true});
const archive=path.join(destination,'foundation.tar');
execFileSync('git',['archive','--format=tar',`--output=${archive}`,sha],{cwd:app});
execFileSync('tar',['-xf',archive,'-C',destination]);
await writeFile(path.join(destination,'FOUNDATION_SHA'),sha+'\n');
// The frozen foundation used a standalone lockfile at the repository root.
const npm=process.platform==='win32'?'npm.cmd':'npm';
for(const args of [['ci','--ignore-scripts']]){
  const result=spawnSync(npm,args,{cwd:destination,stdio:'inherit',shell:process.platform==='win32',windowsHide:true});
  if(result.status!==0)throw Error('Foundation preparation failed: '+args.join(' '));
}
execFileSync(process.execPath,[path.join(destination,'node_modules/next/dist/bin/next'),'build'],{cwd:destination,stdio:'inherit',windowsHide:true});
