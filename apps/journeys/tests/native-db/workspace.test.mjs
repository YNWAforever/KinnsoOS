import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {repositoryRoot,resolveCachedCli} from './workspace.mjs';

test('live runtime resolves the repository, not the apps directory',()=>{
  assert(existsSync(path.join(repositoryRoot,'supabase','migrations')));
  assert(existsSync(path.join(repositoryRoot,'apps','journeys','package.json')));
  assert(!repositoryRoot.endsWith(path.sep+'apps'+path.sep));
});
test('CLI resolution can use the main worktree cache without network or global fallbacks',async()=>{
  const root=path.resolve('test-repo'),main=path.resolve('main-repo'),calls=[];
  const entry=await resolveCachedCli(root,{
    commonDirectory:async()=>path.join(main,'.git'),
    resolvePackage:async candidate=>{calls.push(candidate);if(candidate===root)throw Error('not installed');return path.join(main,'node_modules/supabase/package.json');},
    readPackage:async()=>({version:'2.107.0'})
  });
  assert.equal(entry,path.join(main,'node_modules/supabase/dist/supabase.js'));
  assert.deepEqual(calls,[root,main]);
});
test('uncached or changed CLI version fails closed',async()=>{
  await assert.rejects(resolveCachedCli(path.resolve('test-repo'),{
    commonDirectory:async()=>path.resolve('test-repo/.git'),
    resolvePackage:async()=>path.resolve('test-repo/node_modules/supabase/package.json'),
    readPackage:async()=>({version:'2.108.0'})
  }),{code:'CLI_UNAVAILABLE_OR_MISMATCH'});
});
