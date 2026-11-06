import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
const source=new URL('../app/travel/routes.ts',import.meta.url);
async function routes(){
 assert.ok(existsSync(source),'route classifier must exist');
 const compiled=await build({entryPoints:[fileURLToPath(source)],bundle:true,write:false,platform:'node',format:'cjs'});
 const module={exports:{}};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require,structuredClone,crypto});
 return module.exports;
}
const offer='11111111-1111-4111-8111-111111111111';
test('legacy offer claims and booking confirmations resolve to explicit capability gates',async()=>{
 const {gatedLegacyRoute,isKnownRoute}=await routes();
 assert.equal(gatedLegacyRoute('offers/'+offer),'offer-claim');
 assert.equal(gatedLegacyRoute('experiences/synthetic-experience/booked'),'booking-confirmation');
 assert.equal(isKnownRoute('offers/'+offer),true);
 assert.equal(isKnownRoute('experiences/synthetic-experience/booked'),true);
});
test('gated legacy route recognition rejects malformed or ambiguous paths',async()=>{
 const {gatedLegacyRoute,isKnownRoute}=await routes();
 for(const path of ['offers/not-a-uuid','offers/'+offer+'/extra','experiences//booked','experiences/synthetic/booked/extra','experiences/synthetic/checkout']){
  assert.equal(gatedLegacyRoute(path),null,path);
  assert.equal(isKnownRoute(path),false,path);
 }
});
