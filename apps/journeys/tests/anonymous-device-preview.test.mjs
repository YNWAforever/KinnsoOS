import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';

const source=await readFile(new URL('../app/travel/TripWorkspace.tsx',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
function preview(actorId,id,valid=true,includeHidden=false){
 const ImportPreview=()=>null,module={exports:{}},jsx=(type,props)=>({type,props});
 const context=createContext({module,exports:module.exports,require:name=>{
  if(name==='react')return{useState:initial=>[initial===true&&!valid?false:initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='next/navigation')return{useRouter:()=>({})};
  if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path,ready:true})};
  if(name==='./ImportPreview')return{ImportPreview};
  return{};
 }});
 runInContext(compiled.code,context);
 const tree=module.exports.TripWorkspace({actorId,id});
 const nodes=node=>!node||typeof node!=='object'||(!includeHidden&&node.props?.hidden)?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
 return nodes(tree).filter(node=>node.type===ImportPreview);
}
test('the anonymous trip index offers an explicit device preview after cancelled sign-in',()=>{
 const children=preview(null);assert.equal(children.length,1,'cancelled login must not hide the original device copies');
 assert.equal(children[0].props.actorId,null,'a device preview cannot gain an authenticated import capability');
});
test('an invalidated account view cannot expose device previews in place of account content',()=>{
 assert.equal(preview('account-A',undefined,false).length,0);
});

test('the hidden device surface remains mounted during invalidation with account import disabled',()=>{
 const children=preview('account-A',undefined,false,true);assert.equal(children.length,1,'account invalidation must conceal rather than discard device editing state');assert.equal(children[0].props.actorId,null);
});
test('an anonymous private-trip deep link does not reveal unrelated device copies',()=>{
 assert.equal(preview(null,'private-trip-A').length,0);
});
const guideCode=await transform(await readFile(new URL('../app/travel/GuideWorkspace.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
function guideRecovery(actorId,valid=true,kind='itinerary'){
 const GuestPlanner=()=>null,module={exports:{}},jsx=(type,props)=>({type,props});
 runInContext(guideCode.code,createContext({module,exports:module.exports,require:name=>{
  if(name==='react')return{useState:initial=>[initial===true&&!valid?false:initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='next/navigation')return{useRouter:()=>({}),useSearchParams:()=>({get:()=>null})};
  if(name==='./ui')return{useApp:()=>({t:en=>en,href:path=>'/en/'+path})};if(name==='./GuestPlanner')return{GuestPlanner};return{};
 }}));
 const tree=module.exports.GuideWorkspace({id:'guide-one',actorId,initialGuide:{id:'guide-one',kind,version:2}});
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
 return nodes(tree).filter(node=>node.type===GuestPlanner);
}
test('a valid signed-in guide view offers explicit device recovery with its current actor',()=>{
 const result=guideRecovery('account-A');assert.equal(result.length,1);assert.equal(result[0].props.actorId,'account-A');
 assert.equal(guideRecovery(null)[0].props.actorId,null);
});
test('invalidated guide views and summary content do not render a device itinerary editor',()=>{
 assert.equal(guideRecovery('account-A',false).length,0);assert.equal(guideRecovery(null,true,'summary').length,0);
});
