import {readFile,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceName=name=>typeof name==='string'&&name.length>0&&!/[\\:\x00]/.test(name)&&
 !path.posix.isAbsolute(name)&&name.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');
export async function verifySourceInputs(app,metadata){
 const root=await realpath(app),manifestBytes=await readFile(path.join(root,'scripts/source-manifest.json'));
 if(hash(manifestBytes)!==metadata.sha256?.['scripts/source-manifest.json'])throw Error('Build source differs from packaged source');
 const manifest=JSON.parse(manifestBytes),mapped=manifest.repositoryFiles??{};
 if(!Array.isArray(manifest.files)||mapped===null||typeof mapped!=='object'||Array.isArray(mapped))throw Error('Build source differs from packaged source');
 const expected=[...manifest.files,...Object.keys(mapped)],actual=Object.keys(metadata.sha256).sort();
 // Reject manifest aliases before resolving or reading any declared source input.
 if(!expected.every(sourceName))throw Error('Build source differs from packaged source');
 expected.sort();
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Build source differs from packaged source');
 const extracted=existsSync(path.join(root,'SOURCE_METADATA.json'));
 for(const [name,digest] of Object.entries(metadata.sha256)){
  const source=mapped[name];
  if(source&&(typeof source!=='string'||!/^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(source)||name!=='tests/contracts/'+path.basename(source)))throw Error('Build source differs from packaged source');
  if(source&&!extracted&&(path.basename(root)!=='journeys'||path.basename(path.dirname(root))!=='apps'))throw Error('Build source differs from packaged source');
  const selected=source&&!extracted?path.resolve(root,'../..',source):path.resolve(root,name);
  if((await realpath(selected))!==selected||hash(await readFile(selected))!==digest)throw Error('Build source differs from packaged source');
 }
 return actual.length;
}
