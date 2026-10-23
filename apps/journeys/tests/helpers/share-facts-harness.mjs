import {build} from 'esbuild';
import {createContext,runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

// Same in-memory TSX/hook scheduler as workspace-harness and guest-planner tests.
// Actual sharing/reason/feasibility code is bundled. Only UI, HTTP and account
// invalidation boundaries are substituted; no client, storage or network opens.
export const tick=()=>new Promise(resolve=>setImmediate(resolve));
export const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject};};
export function memoryStorage(){const rows=new Map();return{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}
export const ok=data=>({ok:true,data});
export const unavailable=()=>({ok:false,code:'UNAVAILABLE',retryable:true,requestId:'99999999-9999-4999-8999-999999999999'});

export function tripFixture(id='11111111-1111-4111-8111-111111111111'){
 return {id,title:'Private Kyoto plan',destinationId:null,timezone:'Asia/Tokyo',startDate:null,status:'planning',revision:1,
  days:[{id:'22222222-2222-4222-8222-222222222222',offset:0,title:'First day',stops:[
   {id:'33333333-3333-4333-8333-333333333333',placeId:'55555555-5555-4555-8555-555555555555',title:'Temple',position:0,travellerNote:'PRIVATE NOTE',sourceDescription:'Original creator text',startMinuteOfDay:0,durationMinutes:0,source:{guideId:'77777777-7777-4777-8777-777777777777',guideVersion:2,creatorId:'88888888-8888-4888-8888-888888888888',creatorName:'Original author',canonicalUrl:'https://www.kinnso.ai/en/g/original',withdrawn:false}},
   {id:'44444444-4444-4444-8444-444444444444',placeId:null,title:'Manual stop',position:1,travellerNote:'PRIVATE MANUAL NOTE',sourceDescription:'',startMinuteOfDay:null,durationMinutes:null,source:null}
  ]}],
  media:[{id:'66666666-6666-4666-8666-666666666666',ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',visibility:'private',state:'ready',stopId:null}],
  overrides:[{stopId:'33333333-3333-4333-8333-333333333333',code:'UNVERIFIED_HOURS',reason:'Private reason kept exactly.'}],
  pendingPhotos:[{name:'private-photo.png',mime:'image/png',size:0}]};
}
export const factFixture=(patch={})=>({placeId:'55555555-5555-4555-8555-555555555555',timezone:'Asia/Tokyo',openingHours:[{weekday:0,openMinute:0,closeMinute:1440}],verifiedAt:'2020-01-02T03:04:05.000Z',sourceUrl:'https://venue.test/opening-hours',...patch});
export const linkFixture=(id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')=>({id,createdAt:'2026-10-23T00:00:00.000Z',expiresAt:'2026-10-29T00:00:00.000Z'});
export const shareFixture=()=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',url:'https://www.kinnso.ai/share/token-once',projection:{title:'Private Kyoto plan',days:[{id:'22222222-2222-4222-8222-222222222222',offset:0,title:'First day',stops:[{id:'33333333-3333-4333-8333-333333333333',placeId:'55555555-5555-4555-8555-555555555555',title:'Temple',position:0,startMinuteOfDay:0,durationMinutes:0,description:'Original creator text',source:{guideId:'77777777-7777-4777-8777-777777777777',guideVersion:2,creatorId:'88888888-8888-4888-8888-888888888888',creatorName:'Original author',canonicalUrl:'https://www.kinnso.ai/en/g/original',withdrawn:false}}]}],approvedMediaIds:[]}});

export const requestFixture=(patch={})=>({requestId:'99999999-9999-4999-8999-999999999999',tripId:tripFixture().id,stopIds:['33333333-3333-4333-8333-333333333333'],mediaIds:[],expiresAt:'2026-10-29T00:00:00.000Z',...patch});
export const receiptFixture=(intent=requestFixture(),patch={})=>{
 const share=shareFixture();
 share.projection.days=share.projection.days.map(day=>({...day,stops:day.stops.filter(stop=>intent.stopIds.includes(stop.id))}));
 share.projection.approvedMediaIds=[...intent.mediaIds];
 return {...share,requestId:intent.requestId,createdAt:'2026-10-23T00:00:00.000Z',expiresAt:intent.expiresAt,state:'active',intent:structuredClone(intent),...patch};
};
export const receiptRow=receipt=>Object.fromEntries(['requestId','id','createdAt','expiresAt','state'].map(key=>[key,receipt[key]]));
export const receiptPage=(items=[],nextCursor=null)=>ok({items,nextCursor});

export async function shareFactsHarness(name,{request=async()=>{throw Error('Unexpected request')},facts=async()=>{throw Error('Unexpected facts read')},clipboard=async()=>{},locale='en',props={},clock=Date,storage=memoryStorage(),crypto=webcrypto,stateBailouts=false}={}){
 const states=[],refs=[],effects=[],invalidators=new Set(),calls=[];let cursor=0,changed=false,tree,mounted=true;
 const currentProps={trip:tripFixture(),enabled:true,recoveryEnabled:true,save:async()=>true,...props};
 const react={
  useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{const next=typeof value==='function'?value(states[i]):value;if(!stateBailouts||!Object.is(next,states[i])){states[i]=next;changed=true;}}]},
  useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial})},
  useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}
 };
 const snippets={
  ui:"export const useApp=()=>({locale:globalThis.__locale,t:(en,zh)=>globalThis.__locale==='zh-HK'?zh:en,href:path=>'/'+globalThis.__locale+'/'+path});",
  repository:"export const request=(...args)=>globalThis.__request(...args);",
  drafts:"export const subscribeAccountInvalidation=fn=>globalThis.__subscribe(fn);"
 };
 const compiled=await build({entryPoints:[new URL('../../app/travel/'+name+'.tsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'share-facts-boundaries',setup(b){
  b.onResolve({filter:/.*/},args=>{
   if(args.path.includes('supabase'))throw Error('Real client import forbidden');
   const port=args.path==='./ui'?'ui':(args.path.endsWith('/trips/repository')||(args.path==='./repository'&&args.importer.endsWith('sharing.ts')))?'repository':args.path.endsWith('/trips/local-drafts')?'drafts':null;
   return port?{path:port,namespace:'boundary'}:null;
  });
  b.onLoad({filter:/.*/,namespace:'boundary'},args=>({loader:'js',contents:snippets[args.path]}));
 }}]});
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 const context=createContext({module,exports:module.exports,Date:clock,Intl,URL,URLSearchParams,crypto,console,
  navigator:{clipboard:{writeText:clipboard}},window:{sessionStorage:storage},
  fetch:async(url,options)=>{calls.push({url,options});if(url!=='/api/trips/'+currentProps.trip.id+'/facts'||options?.cache!=='no-store')throw Error('Unexpected fetch '+url);const data=await facts(url,options);return{ok:data.ok,json:async()=>data};},
  __locale:locale,__request:(...args)=>request(...args),__subscribe:fn=>{invalidators.add(fn);return()=>invalidators.delete(fn);},
  require:specifier=>{if(specifier==='react')return react;if(specifier==='react/jsx-runtime')return{jsx,jsxs:jsx};throw Error('Unexpected dependency '+specifier);}
 });
 runInContext(compiled.outputFiles[0].text,context);
 function render(){if(!mounted)return tree;for(let n=0;n<15;n++){changed=false;cursor=0;tree=module.exports[name](currentProps);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 function text(node){if(arguments.length===0)node=tree;return typeof node==='string'||typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(child=>text(child)).join(' '):'';}
 const button=label=>elements().find(node=>node.type==='button'&&text(node)===label);
 async function settle(){for(let n=0;n<3;n++){await tick();render();}}
 render();
 return {props:currentProps,render,elements,text,button,calls,settle,
  invalidate(ownerId=null){for(const fn of [...invalidators])fn(ownerId);render();},
  replayEffects(){for(const effect of effects)effect?.cleanup?.();for(const effect of effects)if(effect)effect.cleanup=effect.work();render();},
  unmount(){mounted=false;for(const effect of effects)effect?.cleanup?.();}
 };
}
