import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {createRequire} from 'node:module';
import {build,transform} from 'esbuild';
import {safeReturnPath} from '../../lib/auth/return-path.ts';
import {actionGroup} from '../../lib/collaboration/tasks.ts';

const require=createRequire(import.meta.url);
export const tick=()=>new Promise(resolve=>setImmediate(resolve));
const servicePath=new URL('../../app/travel/WorkspaceServiceState.tsx',import.meta.url);
export async function serviceStateModule(jsx) {
  if(!existsSync(servicePath))return {};
  const source=await transform(await readFile(servicePath,'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'});
  const module={exports:{}};
  runInContext(source.code,createContext({module,exports:module.exports,require:name=>{
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
    if(name==='../../lib/auth/return-path')return{safeReturnPath};
    throw Error('Unexpected service state dependency '+name);
  }}));
  return module.exports;
}

export async function taskComponentModule(jsx){
 const source=await transform(await readFile(new URL('../../app/travel/CollaborationTasks.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'});
 const module={exports:{}};
 runInContext(source.code,createContext({module,exports:module.exports,require:name=>{
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='../../lib/collaboration/tasks')return{actionGroup};
  throw Error('Unexpected task component dependency '+name);
 }}));return module.exports;
}

export async function listFilterModule(jsx){
 const helpers=await import('../../lib/collaboration/list-query.ts');
 const source=await transform(await readFile(new URL('../../app/travel/CollaborationListFilters.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'});
 const module={exports:{}};runInContext(source.code,createContext({module,exports:module.exports,require:name=>{if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name.endsWith('/collaboration/list-query'))return helpers;throw Error(name);}}));return module.exports;
}

/** Executes actual component handlers; only session/network/framework boundaries are doubles. */
export async function workspaceHarness(name,ports={},initial={}) {
  const states=[],refs=[],effects=[],events=[],invalidators=new Set();let cursor=0,changed=false,tree,sequence=initial.sequence??0;
  const props={actorId:'actor-A',enabled:true,path:'studio/missions',merchantId:'11111111-1111-4111-8111-111111111111',refreshKey:0,locked:false,onDenied:()=>{},onLockChange:()=>{},onChanged:async()=>{},...initial};
  const react={useId:()=> 'fixture-contact',useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
  const jsx=(type,props)=>typeof type==='function'?(initial.shallow?{type:type.name,props}:type(props)):({type,props});
  const snippets={ui:`export const useApp=()=>({locale:globalThis.__locale,t:(en,zh)=>globalThis.__locale==='zh-HK'?zh:en,href:path=>'/'+globalThis.__locale+'/'+path});`,
    drafts:`export const subscribeAccountInvalidation=fn=>globalThis.__subscribe(fn);export const synchronizeAccountCache=async()=>{};export const readLocalWorkspaceRecovery=async(...args)=>globalThis.__ports.workspaceRecovery?.read(...args)??null;export const saveLocalWorkspaceRecovery=async(...args)=>globalThis.__ports.workspaceRecovery?.save(...args);export const clearLocalWorkspaceRecovery=async(...args)=>globalThis.__ports.workspaceRecovery?.clear(...args);export const releaseLocalWorkspaceRecovery=async(...args)=>globalThis.__ports.workspaceRecovery?.release(...args);`,
    creator:'export const creatorMissions=globalThis.__ports.creatorMissions; export const creatorEarnings=globalThis.__ports.creatorEarnings;',
    campaigns:'export const merchantCampaigns=globalThis.__ports.merchantCampaigns;',
    insights:'export const merchantInsights=globalThis.__ports.merchantInsights;',
    finance:'export const finance=globalThis.__ports.finance;',
    merchant:'export const merchants=globalThis.__ports.merchants;',
    discovery:'export const merchantCreators=globalThis.__ports.merchantCreators;',
    onboarding:'export const merchantOnboarding=globalThis.__ports.merchantOnboarding;',
    repository:'export const request=(...args)=>globalThis.__ports.request(...args);',
    missing:'export const WorkspaceServiceState=()=>null;'};
  const compiled=await build({entryPoints:[new URL('../../app/travel/'+(name==='SupportWorkspace'?'InboxWorkspace':name)+'.tsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime','next/link','next/navigation'],plugins:[{name:'boundary-ports',setup(b){
    b.onResolve({filter:/.*/},args=>{
      let path;
      if(args.path==='./ui')path='ui';
      else if(args.path.endsWith('/trips/local-drafts'))path='drafts';
      else if(args.path.endsWith('/creators/collaboration'))path='creator';
      else if(args.path.endsWith('/merchants/campaign-repository'))path='campaigns';
      else if(args.path.endsWith('/merchants/insights-repository'))path='insights';
      else if(args.path.endsWith('/finance/repository'))path='finance';
      else if(args.path.endsWith('/merchants/repository')&&args.importer.endsWith('FinanceWorkspace.tsx'))path='merchant';
      else if(args.path.endsWith('/merchants/creator-discovery'))path='discovery';
      else if(args.path.endsWith('/merchants/onboarding'))path='onboarding';
      else if(args.path.endsWith('/trips/repository'))path='repository';
      else if(args.path==='./WorkspaceServiceState'&&!existsSync(servicePath))path='missing';
      return path?{path,namespace:'test'}:null;
    });
    b.onLoad({filter:/.*/,namespace:'test'},args=>({loader:'js',contents:snippets[args.path]}));
  }}]});
  const session=new Map();const module={exports:{}};
  const context=createContext({module,exports:module.exports,Date,URL,URLSearchParams,console,setTimeout,clearTimeout,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},window:{location:{pathname:'/'+(initial.locale??'en')+'/'+props.path,search:initial.search??'',reload(){}},addEventListener(){},removeEventListener(){},sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)}},__locale:initial.locale??'en',__ports:ports,__subscribe:fn=>{invalidators.add(fn);return()=>invalidators.delete(fn);},require:name=>{
    if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return'a';if(name==='next/navigation')return{useRouter:()=>({refresh(){}}),useSearchParams:()=>new URLSearchParams(context.window.location.search)};
    return require(name);
  }});
  runInContext(compiled.outputFiles[0].text,context);
  function render(){for(let n=0;n<15;n++){cursor=0;changed=false;tree=module.exports[name](props);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
  function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
  function text(node){if(arguments.length===0)node=tree;return typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(child=>text(child)).join(' '):'';}
  const find=(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||text(x)===label));
  const field=label=>{const row=elements().find(x=>x.type==='label'&&[x.props.children].flat(Infinity).includes(label));return row&&elements(row).find(x=>['input','textarea','select'].includes(x.type));};
  render();for(let n=0;n<4;n++){await tick();render();}return{props,render,find,field,elements,text,events,navigate:search=>{context.window.location.search=search;render();},invalidate:()=>{for(const invalidate of [...invalidators])invalidate(null);render();}};
}

/** Legacy component suites execute the same recovery hook; persistence remains a device boundary. */
export async function recoveryHookModule(react){
 const source=await transform(await readFile(new URL('../../app/travel/useWorkspaceRecovery.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}),module={exports:{}};
 runInContext(source.code,createContext({module,exports:module.exports,window:{addEventListener(){},removeEventListener(){}},require:name=>{if(name==='react')return react;if(name.endsWith('/local-drafts'))return{synchronizeAccountCache:async()=>{},readLocalWorkspaceRecovery:async()=>null,saveLocalWorkspaceRecovery:async()=>{},clearLocalWorkspaceRecovery:async()=>{},releaseLocalWorkspaceRecovery:async()=>{}};throw Error(name);}}));return module.exports;
}
