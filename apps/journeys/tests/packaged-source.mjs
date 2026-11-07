import {existsSync} from 'node:fs';

/** Corresponding-source tests run from the extracted archive, which copies reviewed parent inputs into tests/contracts. */
export function packagedSource(from){
  return existsSync(new URL('../SOURCE_METADATA.json', from));
}
export function migrationUrl(name, from){
  if(!/^[0-9]{14}_[a-z0-9_]+\.sql$/.test(name))throw Error('Reviewed migration name required');
  return new URL((packagedSource(from)?'./contracts/':'../../../supabase/migrations/')+name, from);
}
export function repositoryInputUrl(source, from){
  if(typeof source!=='string'||source.split('/').some(part=>part===''||part==='.'||part==='..'))throw Error('Reviewed repository input required');
  const base=source.split('/').at(-1);
  return new URL(packagedSource(from)?'./contracts/'+base:'../../../'+source, from);
}
