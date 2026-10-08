import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const filters=await import('../lib/ops/queue-filters.ts').catch(()=>({}));
const mission='11111111-1111-4111-8111-111111111111';
test('filter links preserve only supported mission/status criteria, never cursors or private results',()=>{
 assert.equal(typeof filters.readQueueFilter,'function');
 assert.deepEqual(filters.readQueueFilter(new URLSearchParams('missionId='+mission+'&status=submitted&cursor=private&notes=private')), {missionId:mission,status:'submitted'});
 assert.equal(filters.queueFilterPath('zh-HK',{missionId:mission,status:'revision_requested',notes:'PRIVATE',cursor:'PRIVATE'}),'/zh-HK/ops?missionId='+mission+'&status=revision_requested');
 assert.equal(filters.queueFilterPath('en',{}),'/en/ops');
 for(const id of ['cc08a943-52fc-94e8-5310-e0965d7d0fcb','CC08A943-52FC-D4E8-0310-E0965D7D0FCB'])assert.deepEqual(filters.readQueueFilter(new URLSearchParams('missionId='+id)),{missionId:id},'Preserve existing database UUID identity semantics');
 for(const raw of ['status=approved','missionId=nope','status=submitted&status=revision_requested','missionId='+mission+'&missionId='+mission])assert.equal(filters.readQueueFilter(new URLSearchParams(raw)),null);
});
test('deadline state is page-local and preserves unknown timestamps',()=>{
 assert.equal(typeof filters.deadlineState,'function');const now=Date.parse('2030-01-02T00:00:00Z');
 assert.equal(filters.deadlineState('2030-01-01T00:00:00Z',now),'overdue');assert.equal(filters.deadlineState('2030-01-03T00:00:00Z',now),'upcoming');
 assert.equal(filters.deadlineState(null,now),'unknown');assert.equal(filters.deadlineState('invalid',now),'unknown');
});
test('routing criteria links reject duplicates and keep only assignment/order criteria',()=>{
 assert.deepEqual(filters.readQueueFilter(new URLSearchParams('assignment=mine&order=deadline&selected=PRIVATE')),{assignment:'mine',order:'deadline'});
 assert.equal(filters.queueFilterPath('en',{assignment:'unassigned',order:'deadline',results:'PRIVATE'}),'/en/ops?assignment=unassigned&order=deadline');
 for(const raw of ['assignment=uuid','order=client','assignment=mine&assignment=unassigned','order=deadline&order=signal'])assert.equal(filters.readQueueFilter(new URLSearchParams(raw)),null);
});
const source=await readFile(new URL('../app/travel/OpsWorkspace.tsx',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
function harness(ports,search='',actorId='actor-A'){
 const states=[],refs=[],effects=[];let cursor=0,changed=false,tree,invalidator;
 const history=[];const location={search};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((x,j)=>!Object.is(x,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,crypto,URLSearchParams,window:{location,history:{replaceState(_a,_b,path){history.push(path);location.search=path.includes('?')?'?'+path.split('?')[1]:'';}}},require:name=>{
  if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='next/link')return{__esModule:true,default:'a'};
  if(name==='./ui')return{useApp:()=>({locale:'en',t:en=>en}),Modal:'modal'};
  if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:fn=>{invalidator=fn;return()=>{};}};
  if(name==='../../lib/ops/repository')return{ops:{routing:async()=>({ok:false,code:'UNAVAILABLE'}),...ports}};if(name==='../../lib/ops/queue-filters')return filters;
  throw Error('Unexpected dependency '+name);
 }}));
 function render(){for(let n=0;n<8;n++){changed=false;cursor=0;tree=module.exports.OpsWorkspace({actorId,enabled:true});for(const e of effects)if(e?.pending){e.pending=false;e.cleanup?.();e.cleanup=e.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 const find=(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||x.props.children===label));
 render();return{render,elements,find,history,invalidate:()=>invalidator?.(null)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const row=id=>({submissionId:id,missionId:mission,missionTitle:'Mission',status:'submitted',reviewDeadline:'2030-01-01T00:00:00Z'});
const routing={memberId:'member-A',canAssign:true,members:[{id:'member-A',name:'Current operator',role:'admin',status:'active'}],membersTruncated:false,presets:[{id:'preset-A',name:'Deadline work',filter:{order:'deadline'},revision:1}]};
test('workspace opens server-owned criteria and assignment retries exactly one held command',async()=>{
 const calls=[],reads=[];let attempt=0;
 const h=harness({queue:async(...args)=>{reads.push(args);return{ok:true,data:{items:[{...row('submission-A'),assignmentRevision:0}],nextCursor:null}};},summary:async()=>({ok:true,data:[]}),routing:async()=>({ok:true,data:routing}),assign:async(...args)=>{calls.push(args);return ++attempt===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{revision:1}};}});
 await tick();h.render();const open=h.find('button','Open filter: Deadline work');assert.ok(open);await open.props.onClick();await tick();h.render();assert.deepEqual(JSON.parse(JSON.stringify(reads.at(-1)[0])),{order:'deadline'});
 h.find('button','Assign review').props.onClick({currentTarget:{}});h.render();h.find('select','Assigned operator').props.onChange({target:{value:'member-A'}});h.find('textarea','Assignment reason').props.onChange({target:{value:'Routing audit'}});h.render();await h.find('button','Confirm assignment').props.onClick();await tick();h.render();assert.equal(calls.length,1);
 await h.find('button','Retry routing request').props.onClick();await tick();h.render();assert.deepEqual(calls[1],calls[0]);assert.deepEqual(calls[0].slice(0,4),['submission-A','member-A',0,'Routing audit']);
});
test('routing missing schema does not remove the existing queue; revoked responses clear saved criteria',async()=>{
 const h=harness({queue:async()=>({ok:true,data:{items:[row('old')],nextCursor:null}}),summary:async()=>({ok:true,data:[]})});await tick();h.render();assert.ok(h.find('h2','Review submissions'));assert.ok(h.find('p','Assignment and saved filters are not connected yet.'));
 let resolve;const delayed=harness({queue:async()=>({ok:true,data:{items:[row('old')],nextCursor:null}}),summary:async()=>({ok:true,data:[]}),routing:()=>new Promise(r=>{resolve=r;})});delayed.invalidate();delayed.render();resolve({ok:true,data:routing});await tick();delayed.render();assert.equal(JSON.stringify(delayed.elements()).includes('Deadline work'),false);
});
test('sign-in from a reusable filter preserves only validated criteria as the original task',()=>{
 const h=harness({queue:()=>assert.fail('Anonymous workspace must not read private queue')},'?missionId='+mission+'&status=submitted&notes=PRIVATE',null);
 const next=new URL(h.find('a','Sign in to continue').props.href,'https://local.test').searchParams.get('next');assert.equal(next,'/en/ops?missionId='+mission+'&status=submitted');
});
test('real workspace sends selected server criteria and resets cursor, old page selection and preview',async()=>{
 const calls=[],cursor={bucket:2,deadline:'infinity',id:mission,scope:'scope'};
 const h=harness({queue:async(...args)=>{calls.push(args);return{ok:true,data:{items:[row('old')],nextCursor:cursor}};},summary:async()=>({ok:true,data:[]}),preview:async()=>({ok:true,data:{jobId:'job',selectionSnapshot:[{id:'old'}]}})});
 await tick();h.render();h.find('button','Select this page').props.onClick();h.render();await h.find('button','Preview selection').props.onClick();await tick();h.render();assert.ok(h.find('h2','Confirm this snapshot'));
 await h.find('button','Next page').props.onClick();await tick();h.render();assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1)[1])),cursor);
 const status=h.find('select','Review status');assert.ok(status,'Supported server status filter must be reachable');await status.props.onChange({target:{value:'revision_requested'}});await tick();h.render();
 assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),[{status:'revision_requested'},undefined].map(x=>x??null));
 assert.equal(h.elements().filter(x=>x.type==='input'&&x.props.type==='checkbox').some(x=>x.props.checked),false);assert.equal(h.find('h2','Confirm this snapshot'),undefined);
 assert.ok(h.history.at(-1).includes('status=revision_requested'));
});
test('filter reload restores only criteria and delayed private reads cannot restore a revoked page',async()=>{
 const calls=[];let resolve;
 const h=harness({queue:(...args)=>{calls.push(args);return new Promise(r=>{resolve=r;});},summary:async()=>({ok:true,data:[]})},'?missionId='+mission+'&status=submitted&cursor=PRIVATE');
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),[{missionId:mission,status:'submitted'},null]);
 h.invalidate();h.render();resolve({ok:true,data:{items:[row('PRIVATE_OLD')],nextCursor:null}});await tick();h.render();assert.equal(JSON.stringify(h.elements()).includes('PRIVATE_OLD'),false);
});
test('real workspace re-previews only the three failed IDs out of a100-result batch',async()=>{
 const previews=[],ids=Array.from({length:100},(_,i)=>'submission-'+i);
 const h=harness({queue:async()=>({ok:true,data:{items:ids.map(row),nextCursor:null}}),summary:async()=>({ok:true,data:[]}),preview:async selected=>{previews.push([...selected]);return{ok:true,data:{jobId:'job-'+previews.length,selectionSnapshot:selected.map(id=>({id})),scope:'explicit_selection',maximum:100}};},run:async()=>({ok:true,data:{jobId:'job-1',results:ids.map((id,i)=>({id,ok:i>=3,...i<3?{code:'stale_selection'}:{}})),succeeded:97,failed:3}})});
 await tick();h.render();h.find('button','Select this page').props.onClick();h.render();await h.find('button','Preview selection').props.onClick();await tick();h.render();h.find('textarea','Audit reason').props.onChange({target:{value:'Traceable reason'}});h.render();await h.find('button','Apply confirmed decision').props.onClick();await tick();h.render();await h.find('button','Preview only failed items for retry').props.onClick();await tick();h.render();
 assert.deepEqual(previews,[ids,ids.slice(0,3)]);
});
test('actual repository sends supported filters/cursor and separately mission-scoped server totals',async()=>{
 const source=await readFile(new URL('../lib/ops/repository.ts',import.meta.url),'utf8');const compiled=await transform(source,{loader:'ts',format:'cjs',target:'es2022'});const calls=[],module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,URLSearchParams,require:name=>{if(name==='../trips/repository')return{request:(...args)=>{calls.push(args);return{ok:true,data:[]};}};if(name==='./queue-filters')return filters;throw Error('Unexpected dependency '+name);}}));
 const cursor={bucket:2,deadline:'infinity',id:mission,scope:'scope'};await module.exports.ops.queue({missionId:mission,status:'submitted'},cursor);await module.exports.ops.summary(mission);
 const query=new URL(calls[0][0],'https://local.test').searchParams;assert.equal(query.get('missionId'),mission);assert.equal(query.get('status'),'submitted');assert.deepEqual(JSON.parse(query.get('cursor')),cursor);assert.equal(calls[1][0],'/api/ops/summary?missionId='+mission);
});
test('actual queue route preserves authoritative denial and rejects unsupported/duplicate filters before RPC',async()=>{
 const source=await readFile(new URL('../app/api/ops/queue/route.ts',import.meta.url),'utf8');const compiled=await transform(source,{loader:'ts',format:'cjs',target:'es2022'});const validation=await import('../lib/api/validation.ts');const calls=[],module={exports:{}};let denied=false;
 runInContext(compiled.code,createContext({module,exports:module.exports,URL,URLSearchParams,require:name=>{
  if(name==='../../../../lib/api/server')return{apiContext:async()=>denied?{response:new Response('{}',{status:403})}:{client:{rpc:async(...args)=>{calls.push(JSON.parse(JSON.stringify(args)));return{data:{items:[],nextCursor:null},error:null};}}},reply:data=>Response.json(data),failure:(_code,status)=>new Response('{}',{status}),backendFailure:()=>new Response('{}',{status:503})};
  if(name==='../../../../lib/api/validation')return validation;if(name==='../../../../lib/ops/queue-filters')return filters;throw Error('Unexpected dependency '+name);
 }}));
 denied=true;assert.equal((await module.exports.GET(new Request('https://local.test/api/ops/queue?status=submitted'))).status,403);assert.equal(calls.length,0);denied=false;
 for(const query of ['status=approved','status=submitted&status=revision_requested','missionId=invalid'])assert.equal((await module.exports.GET(new Request('https://local.test/api/ops/queue?'+query))).status,400);
 assert.equal(calls.length,0);assert.equal((await module.exports.GET(new Request('https://local.test/api/ops/queue?missionId='+mission+'&status=submitted'))).status,200);assert.deepEqual(calls[0],['get_kinnso_review_queue',{p_filter:{missionId:mission,status:'submitted'},p_cursor:null,p_limit:50}]);
});
