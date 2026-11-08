import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';import ts from 'typescript';
const baseline=JSON.parse(await readFile(new URL('./contracts/studio-route-baseline.json',import.meta.url),'utf8'));
test('original, pilot-gated and studio routes remain recognized together',async()=>{
 const load=async(file,dependencies={})=>{
  const source=await readFile(new URL(file,import.meta.url),'utf8'),exports={};
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  new Function('require','exports',outputText)(name=>dependencies[name]??{},exports);
  return exports;
 };
 const studio=await load('../lib/studio/navigation.ts');
 const routes=await load('../app/travel/routes.ts',{'./model':{fixtures:[]},'../../lib/studio/navigation':studio});
 assert.equal(baseline.staticPaths.length,76);
 for(const path of [...baseline.staticPaths,'workroom','offers/11111111-1111-4111-8111-111111111111','experiences/test/booked'])
  assert.equal(routes.isKnownRoute(path),true,path);
 assert.equal(routes.isKnownRoute('workroom/unknown/unknown'),false);
});
test('all 108 original web page/API route files remain in the monorepo',async t=>{try{await access(new URL('../../web/app',import.meta.url));}catch{t.skip('Web route inventory is verified in the monorepo, not the standalone GPL archive');return;}for(const name of baseline.webRouteFiles)await access(new URL('../../'+name.replace('apps/',''),import.meta.url));});
