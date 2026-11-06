import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const component=new URL('../app/travel/LegacyCapabilityGate.tsx',import.meta.url);
async function load(){
 assert.ok(existsSync(component),'legacy capability gate component must exist');
 const compiled=await build({entryPoints:[fileURLToPath(component)],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime','next/link']});
 const module={exports:{}};
 new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
 return module.exports.LegacyCapabilityGate;
}
for(const [locale,offerHeading,bookingHeading] of [
 ['en','Traveller offer claims are disabled','Booking confirmations are disabled'],
 ['zh-HK','旅客優惠領取暫停','訂位確認暫停'],
]){
 test(`${locale}: gated legacy offer and booking pages explain the limitation without private actions`,async()=>{
  const Gate=await load();
  const offer=renderToStaticMarkup(createElement(Gate,{locale,kind:'offer-claim'}));
  const booking=renderToStaticMarkup(createElement(Gate,{locale,kind:'booking-confirmation'}));
  assert.match(offer,new RegExp(`<h1>${offerHeading}</h1>`));
  assert.match(booking,new RegExp(`<h1>${bookingHeading}</h1>`));
  for(const html of [offer,booking]){
   assert.match(html,new RegExp(`href="/${locale}/explore"`));
   assert.doesNotMatch(html,/Pay now|Claim now|Confirm booking|payout|payment successful/i);
  }
 });
}
