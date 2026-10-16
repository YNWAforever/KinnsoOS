// Actual React workspaces, repositories and IndexedDB; only Next navigation,
// session/API transport and out-of-scope media/import panels are doubles.
// This host never reads env files, creates a Supabase client or contacts a DB.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
export const actorA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actorB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',guideId='11111111-1111-4111-8111-111111111111';
const entry=`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {GuideWorkspace,BookmarkWorkspace} from '../../app/travel/GuideWorkspace';
 import {TripWorkspace} from '../../app/travel/TripWorkspace';
 import {clearAccountCaches} from '../../lib/trips/local-drafts';
 window.__offlineSignOut=clearAccountCaches;
 const state=await(await fetch('/__state')).json(),parts=location.pathname.split('/'),locale=parts[1];
 document.documentElement.lang=locale;
 const props={actorId:state.actor};
 const content=parts[2]==='saved'?<BookmarkWorkspace {...props}/>:parts[2]==='g'?<GuideWorkspace {...props} id={parts[3]} initialGuide={state.guide}/>:<TripWorkspace {...props} id={parts[3]}/>;
 createRoot(document.getElementById('root')).render(content);
`;
const ui=`export const useApp=()=>({ready:true,locale:location.pathname.split('/')[1],href:p=>'/'+location.pathname.split('/')[1]+'/'+p,t:(en,zh)=>location.pathname.startsWith('/zh-HK/')?zh:en});`;
const navigation=`const router={push:p=>location.assign(p),replace:p=>history.replaceState(null,'',p),refresh:()=>location.reload()};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);`;
const children=`export const GuestPlanner=()=>null;export const ImportPreview=()=>null;export const RecordCapture=()=>null;export const SharePreview=()=>null;export const TripWarnings=()=>null;`;
export async function offlineTripHost(){
 const bundle=await build({
  stdin:{contents:entry,sourcefile:'offline-entry.tsx',resolveDir:new URL('.',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),loader:'tsx'},
  bundle:true,write:false,format:'esm',platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'offline-boundaries',setup(b){
   b.onResolve({filter:/^(next\/|\.\/ui$|\.\/UnsavedDraftGuard$|\.\/(GuestPlanner|ImportPreview|RecordCapture|SharePreview|TripWarnings)$)/},args=>({path:args.path,namespace:'offline'}));
   b.onLoad({filter:/.*/,namespace:'offline'},({path})=>({loader:'tsx',resolveDir:new URL('.',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),contents:path==='next/navigation'?navigation:path==='next/link'?`import React from 'react';export default function Link(p){return <a {...p}/>}`:path==='next/image'?`import React from 'react';export default function Image({fill,sizes,...p}){return <img {...p}/>} `:path==='./ui'?ui:path==='./UnsavedDraftGuard'?`export const useDraftNavigation=()=>p=>location.assign(p);`:children}));
  }}],
 });
 const guide={kind:'itinerary',id:guideId,title:'Synthetic Kyoto private route',version:1,destinationId:null,publishedAt:'2026-10-16T00:00:00Z',creator:{id:actorB,name:'Synthetic licensed-content stand-in',handle:'synthetic'},days:[{id:randomUUID(),offset:0,title:'Synthetic authored day',stops:[{id:randomUUID(),position:0,title:'Synthetic authored stop',description:'Synthetic public directions',placeId:null,startMinuteOfDay:570,durationMinutes:45,source:null}]}]};
 const trips=new Map(),receipts=new Map(),bookmarks=new Map([[actorA,true],[actorB,false]]),requests=[];
 const faults={loseCreate:false,loseAdopt:false,refuseAdopt:false,withdrawn:false};
 const css=(await Promise.all(['globals.css','travel/workbench.css','integration/integration.css'].map(file=>readFile(new URL('../../app/'+file,import.meta.url),'utf8')))).join('\n');
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture.invalid'),actor=req.headers.cookie?.match(/(?:^|;\s*)actor=([^;]+)/)?.[1]??null;
  const send=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'private, no-store'});res.end(JSON.stringify(body))};
  try{
   if(url.pathname==='/bundle.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(bundle.outputFiles[0].text);return}
   if(url.pathname==='/__state'){send({actor,guide:faults.withdrawn?null:guide});return}
   if(url.pathname==='/__session'){res.writeHead(200,{'set-cookie':`actor=${url.searchParams.get('actor')??''}; Path=/; SameSite=Strict`});res.end('Synthetic session only');return}
   if(!url.pathname.startsWith('/api/')){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`);return;
   }
   let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null;
   requests.push({path:url.pathname,method:req.method,actor,body,expectedActor:req.headers['x-kinnso-intent-actor']??null});
   if(url.pathname==='/api/session'){send({ok:true,data:actor?{id:actor}:null});return}
   if(url.pathname==='/api/telemetry/pilot'){send({ok:true,data:{recorded:false}});return}
   if(url.pathname.startsWith('/api/guides/')){send(faults.withdrawn?{ok:false,code:'NOT_FOUND'}:{ok:true,data:guide},faults.withdrawn?404:200);return}
   if(!actor||req.headers['x-kinnso-intent-actor']&&req.headers['x-kinnso-intent-actor']!==actor){send({ok:false,code:'AUTH_REQUIRED'},401);return}
   if(url.pathname==='/api/bookmarks'){
    if(req.method==='POST'){bookmarks.set(actor,body.desiredState);send({ok:true,data:{saved:body.desiredState}})}
    else send({ok:true,data:bookmarks.get(actor)?[{guide_id:guideId,guides:faults.withdrawn?null:{id:guideId,slug:'synthetic',title:guide.title}}]:[],nextCursor:null});
    return;
   }
   if(url.pathname==='/api/trips/creation'){send({ok:true,data:{tripId:receipts.get(actor+':'+url.searchParams.get('requestId'))?.id??null}});return}
   if(url.pathname==='/api/trips'){
    if(req.method==='GET'){send({ok:true,data:{items:[...trips.values()].filter(t=>t.owner===actor).map(({value})=>value),nextCursor:null}});return}
    const key=actor+':'+body.requestId,prior=receipts.get(key);
    if(prior&&prior.payload!==JSON.stringify(body.input)){send({ok:false,code:'CONFLICT'},409);return}
    let value=prior?.value;
    if(!value){value={id:randomUUID(),...body.input,destinationId:null,status:'planning',revision:1,days:[],media:[],overrides:[]};trips.set(value.id,{owner:actor,value});receipts.set(key,{id:value.id,value:structuredClone(value),payload:JSON.stringify(body.input)})}
    if(faults.loseCreate){faults.loseCreate=false;req.socket.destroy();return}send({ok:true,data:value},201);return;
   }
   const match=url.pathname.match(/^\/api\/trips\/([^/]+)(?:\/(adopt|commands))?$/),row=match&&trips.get(match[1]);
   if(!row||row.owner!==actor){send({ok:false,code:'NOT_FOUND'},404);return}
   if(req.method==='GET'){send({ok:true,data:row.value});return}
   const key=actor+':'+body.requestId,prior=receipts.get(key);
   if(prior){send({ok:true,data:prior.value});return}
   if(body.expectedRevision!==row.value.revision){send({ok:false,code:'CONFLICT'},409);return}
   if(match[2]==='adopt'){
    if(faults.refuseAdopt){faults.refuseAdopt=false;send({ok:false,code:'UNAVAILABLE'},503);return}
    if(faults.withdrawn){send({ok:false,code:'INVALID'},400);return}
    row.value.days.push(...guide.days.map(day=>({...structuredClone(day),id:randomUUID(),stops:day.stops.map(stop=>({...structuredClone(stop),id:randomUUID(),travellerNote:'',sourceDescription:stop.description,source:{guideId,guideVersion:guide.version,creatorId:actorB,creatorName:guide.creator.name,canonicalUrl:null,withdrawn:false}}))})));
   }else if(body.command.type==='updateStop'){
    for(const day of row.value.days)for(const stop of day.stops)if(stop.id===body.command.id)Object.assign(stop,body.command.patch);
   }else if(body.command.type==='patchTrip')Object.assign(row.value,body.command.patch);
   row.value.revision++;receipts.set(key,{value:structuredClone(row.value)});
   if(faults.loseAdopt){faults.loseAdopt=false;req.socket.destroy();return}send({ok:true,data:row.value});
  }catch{send({ok:false,code:'UNAVAILABLE'},503)}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return{origin:'http://127.0.0.1:'+server.address().port,guide,trips,receipts,requests,faults,close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}
