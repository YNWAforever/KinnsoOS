import {existsSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readContainedFile} from './read-contained-file.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceName=name=>typeof name==='string'&&name.length>0&&!/[\\:\x00]/.test(name)&&
 !path.posix.isAbsolute(name)&&name.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');
export async function verifySourceInputs(app,metadata){
 try{
  const root=realpathSync(app),manifestBytes=readContainedFile(root,'scripts/source-manifest.json',262144);
  if(hash(manifestBytes)!==metadata.sha256?.['scripts/source-manifest.json'])throw Error();
  const manifest=JSON.parse(manifestBytes),mapped=manifest.repositoryFiles??{};
  if(!Array.isArray(manifest.files)||mapped===null||typeof mapped!=='object'||Array.isArray(mapped))throw Error();
  const expected=[...manifest.files,...Object.keys(mapped)],actual=Object.keys(metadata.sha256).sort();
  if(!expected.every(sourceName))throw Error();
  expected.sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error();
  const extracted=existsSync(path.join(root,'SOURCE_METADATA.json'));
  for(const [name,digest] of Object.entries(metadata.sha256)){
   const source=mapped[name];
   if(source&&(typeof source!=='string'||!/^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(source)||name!=='tests/contracts/'+path.basename(source)))throw Error();
   if(source&&!extracted&&(path.basename(root)!=='journeys'||path.basename(path.dirname(root))!=='apps'))throw Error();
   const inputRoot=source&&!extracted?path.resolve(root,'../..'):root;
   const inputName=source&&!extracted?source:name;
   if(hash(readContainedFile(inputRoot,inputName,16*1024*1024))!==digest)throw Error();
  }
  return actual.length;
 }catch{throw Error('Build source differs from packaged source');}
}
