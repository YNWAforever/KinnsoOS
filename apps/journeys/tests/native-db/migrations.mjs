import {readdir,readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {gate} from './target.mjs';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const canonicalManifest=files=>sha256(JSON.stringify(files));
export async function buildMigrationManifest(root){
 const dir=path.resolve(root,'supabase/migrations'),actual=await realpath(dir);
 gate(actual.toLowerCase()===dir.toLowerCase(),'MIGRATION_ROOT_REDIRECTED');
 const names=(await readdir(dir)).filter(n=>n.toLowerCase().endsWith('.sql')).sort();
 gate(names.length>0,'NO_MIGRATIONS');const versions=new Set(),files=[];
 for(const name of names){
  gate(/^\d{14}_[a-z0-9_]+\.sql$/.test(name),'MIGRATION_NAME_INVALID');
  const version=name.slice(0,14);gate(!versions.has(version),'DUPLICATE_MIGRATION_VERSION');versions.add(version);
  const file=path.join(dir,name),stat=await lstat(file);gate(!stat.isSymbolicLink()&&stat.isFile(),'MIGRATION_SYMLINK_FORBIDDEN');
  const bytes=await readFile(file);files.push({name,version,sha256:sha256(bytes),bytes:bytes.length});
 }
 return {version:1,files,hash:canonicalManifest(files)};
}
export async function verifyMigrationManifest(root,expected){
 gate(expected?.version===1&&Array.isArray(expected.files)&&expected.hash===canonicalManifest(expected.files),'MIGRATION_MANIFEST_INVALID');
 const current=await buildMigrationManifest(root);gate(current.hash===expected.hash,'MIGRATION_DRIFT');return current;
}
/** Tests replay control flow only. It never produces a native schema receipt.
 * The live replay/CLI journal must be implemented after target bootstrap is verified.
 */
export async function rehearseReplay(root,manifest,execute){
 await verifyMigrationManifest(root,manifest);const journal=[];
 for(const file of manifest.files){
  // Read and verify the exact buffer passed on, avoiding a filename check/read race.
  const bytes=await readFile(path.join(root,'supabase/migrations',file.name));gate(sha256(bytes)===file.sha256,'MIGRATION_DRIFT');
  try{
   const result=await execute(Object.freeze({...file}),bytes);
   if(result?.exitCode!==0)throw {sqlState:result?.sqlState};
   journal.push({...file,status:'REHEARSED'});
  }catch(error){return {status:'FAIL',evidenceLevel:'L0',nativeReceipt:false,migrationHash:manifest.hash,journal,
   failure:{version:file.version,sqlState:/^[0-9A-Z]{5}$/.test(error?.sqlState??'')?error.sqlState:'UNKNOWN'}};}
 }
 return {status:'REHEARSAL_PASS',evidenceLevel:'L0',nativeReceipt:false,migrationHash:manifest.hash,journal};
}
export function testTypesPath(root,relative='database.types.ts'){
 gate(relative==='database.types.ts','TYPE_OUTPUT_NOT_TEST_LOCAL');return path.resolve(root,'apps/journeys/tests/native-db/generated',relative);
}
