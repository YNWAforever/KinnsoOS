import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const helper=await import('../lib/merchants/invitations.ts').catch(()=>({}));
const token='ab'.repeat(32),company='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
test('invitation secret is exactly one strict fragment and never a login next or query parameter',()=>{
 assert.equal(typeof helper.invitationToken,'function');assert.equal(helper.invitationToken('#invite='+token),token);
 for(const input of ['',token,'#token='+token,'#invite='+token+'&next=/ops','#invite='+token.toUpperCase(),'#invite=%61'+token.slice(1),'#invite='+token+'\n'])assert.equal(helper.invitationToken(input),null);
 assert.equal(helper.invitationLink('https://local.test','zh-HK',token),'https://local.test/zh-HK/merchant/invitation#invite='+token);
 assert.throws(()=>helper.invitationLink('https://local.test','en/../ops',token));
});
test('invitation token uses all32 CSPRNG bytes and refuses unsupported crypto',()=>{
 assert.equal(typeof helper.newInvitationToken,'function');let size=0;const random={getRandomValues:bytes=>{size=bytes.length;bytes.fill(171);return bytes;}};
 assert.equal(helper.newInvitationToken(random),token);assert.equal(size,32);assert.throws(()=>helper.newInvitationToken({}));
});
async function routeHarness(path){
 const source=await readFile(new URL(path,import.meta.url),'utf8'),compiled=await transform(source,{loader:'ts',format:'cjs'}),validation=await import('../lib/api/validation.ts');
 const calls=[],contexts=[];let error=null,denied=null;const module={exports:{}};
 runInContext(compiled.code,createContext({module,exports:module.exports,URL,Error,SyntaxError,require:name=>{
  if(name.endsWith('/api/validation'))return validation;
  if(name.endsWith('/api/server'))return{apiContext:async(...args)=>{contexts.push(args);return denied?{response:denied}:{client:{rpc:async(...args)=>{calls.push(args);return{error,data:{status:'pending'}};}}};},boundedBody:async(req,max)=>{const text=await req.text();if(Buffer.byteLength(text)>max)throw Error('INVALID');return JSON.parse(text);},failure:(code,status)=>Response.json({ok:false,code},{status,headers:{'Cache-Control':'private, no-store'}}),reply:body=>Response.json(body,{headers:{'Cache-Control':'private, no-store'}}),backendFailure:()=>Response.json({ok:false,code:'FORBIDDEN'},{status:403,headers:{'Cache-Control':'private, no-store'}})};
  throw Error('Unexpected dependency '+name);
 }}));
 return{calls,contexts,api:module.exports,setError:value=>{error=value;},deny:()=>{denied=new Response('{}',{status:401});}};
}
const post=(body,url='https://local.test/api/merchant/invitations')=>new Request(url,{method:'POST',headers:{Origin:'https://local.test','Content-Type':'application/json'},body:JSON.stringify(body)});
test('actual owner invitation BFF strictly bounds body and criteria, checks context and omits secret responses',async()=>{
 const h=await routeHarness('../app/api/merchant/invitations/route.ts');
 for(const criteria of ['', 'id='+company+'&email=secret@example.test','id='+company+'&id='+company,'id=invalid','id='+company+'&after='])assert.equal((await h.api.GET(new Request('https://local.test/api/merchant/invitations?'+criteria))).status,400);
 assert.equal(h.calls.length,0);
 assert.equal((await h.api.POST(new Request('https://local.test/api/merchant/invitations',{method:'POST',body:'{broken'}))).status,400);
 const command={type:'create',id:requestId,token,email:'intended@example.test',label:'Colleague',role:'clerk',branchIds:[],reason:'Reviewed scope'};
 for(const value of [{merchantId:company,requestId,command:{...command,role:'owner'}},{merchantId:company,requestId,command:{...command,token:token+'x'}},{merchantId:company,requestId,command:{...command,branchIds:['foreign']}},{merchantId:company,requestId,command:{...command,email:'a@b.test',other:true}},{merchantId:company,requestId,command:{...command,reason:' '}},{merchantId:company,requestId,command,other:true}])assert.equal((await h.api.POST(post(value))).status,400);
 assert.equal(h.calls.length,0);assert.equal((await h.api.POST(post({merchantId:company,requestId,command},'https://local.test/api/merchant/invitations?token='+token))).status,400);assert.equal(h.calls.length,0);
 const response=await h.api.POST(post({merchantId:company,requestId,command}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.equal(h.contexts.at(-1)[1],'merchant');assert.equal(h.contexts.at(-1)[2],true);
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1))),['apply_kinnso_merchant_invitation',{p_merchant_id:company,p_request_id:requestId,p_command:command}]);assert.equal(JSON.stringify(await response.json()).includes(token),false);
 h.setError({message:'invitation_limit'});assert.equal((await h.api.POST(post({merchantId:company,requestId,command}))).status,400);
 h.deny();assert.equal((await h.api.GET(new Request('https://local.test/api/merchant/invitations?id='+company))).status,401);
});
test('actual recipient BFF previews/accepts only secret body, preserves current-session denial and rejects leaked scope',async()=>{
 const h=await routeHarness('../app/api/merchant/invitations/recipient/route.ts');
 for(const body of [{action:'preview',token,merchantId:company},{action:'preview',token,requestId},{action:'accept',token},{action:'accept',token,requestId:'invalid'},{action:'accept',token:token.toUpperCase(),requestId},{action:'preview',token:'x'.repeat(17000)}])assert.equal((await h.api.POST(post(body))).status,400);
 assert.equal(h.calls.length,0);assert.equal((await h.api.POST(post({action:'preview',token},'https://local.test/api/merchant/invitations/recipient?token='+token))).status,400);
 assert.equal((await h.api.POST(post({action:'preview',token}))).status,200);assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),['preview_kinnso_merchant_invitation',{p_token:token}]);assert.equal(h.contexts.at(-1)[2],true);
 const r=await h.api.POST(post({action:'accept',token,requestId}));assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private.*no-store/);assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1])),['accept_kinnso_merchant_invitation',{p_token:token,p_request_id:requestId}]);
 h.setError({message:'forbidden'});assert.equal((await h.api.POST(post({action:'preview',token}))).status,403);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function componentHarness(name,port={}){
 const source=await readFile(new URL('../app/travel/'+name+'.tsx',import.meta.url),'utf8'),compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
 const states=[],refs=[],effects=[];let cursor=0,changed=false,tree,invalidator,props={actorId:'actor-A',merchantId:company,branches:[{id:company,name:'Central'}],locked:false,enabled:true,onDenied:()=>{},onLockChange:()=>{}};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};let uuidIndex=0;
 const listeners=new Map(),location={hash:'#invite='+token,pathname:'/en/merchant/invitation',origin:'https://local.test',search:''},history={replaceState:(_a,_b,value)=>{assert.equal(value.includes(token),false);location.hash='';}};
 const access=await import('../lib/merchants/access.ts');
 runInContext(compiled.code,createContext({module,exports:module.exports,window:{location,history,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},crypto:{getRandomValues:bytes=>{bytes.fill(171);return bytes;},randomUUID:()=>`00000000-0000-4000-8000-${String(++uuidIndex).padStart(12,'0')}`},require:dep=>{
  if(dep==='react')return react;if(dep==='react/jsx-runtime')return{jsx,jsxs:jsx};if(dep==='next/link')return{default:'a'};
  if(dep==='./ui')return{useApp:()=>({t:en=>en,locale:'en'})};if(dep==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:fn=>{invalidator=fn;return()=>{};}};
  if(dep==='../../lib/merchants/invitations')return helper;if(dep==='../../lib/merchants/access')return access;
  if(dep==='../../lib/merchants/repository')return{merchantInvitations:{list:async()=>({ok:true,data:{invitations:[],nextCursor:null}}),...port},merchants:{workspace:async()=>({ok:true,data:{role:'clerk',branches:[]}})}};
  throw Error('Unexpected dependency '+dep);
 }}));
 function render(){for(let n=0;n<12;n++){cursor=0;changed=false;tree=module.exports[name](props);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 const find=(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||x.props.children===label));render();await tick();render();
 return{render,elements,find,location,invalidate:()=>invalidator?.(null),reopen:(value=token)=>{location.hash='#invite='+value;listeners.get('hashchange')?.();render();},replayEffects:()=>{for(const effect of effects)if(effect){effect.cleanup?.();effect.cleanup=effect.work();}render();}};
}
test('actual owner invitation keeps unknown command/token stable, requires reason and clears private response after account invalidation',async()=>{
 const calls=[];const h=await componentHarness('MerchantInvitations',{command:async(...args)=>{calls.push(args);return calls.length===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{id:requestId,status:'pending',expiresAt:'2099-01-01T00:00:00Z'}};}});
 for(const [name,value] of [['Recipient email','intended@example.test'],['Private invitation label','Colleague'],['Invitation reason','Reviewed by owner']]){h.find(name==='Invitation reason'?'textarea':'input',name).props.onChange({target:{value}});h.render();}
 h.find('form','Invitation form').props.onSubmit({preventDefault(){}});await tick();h.render();assert.equal(calls.length,1);assert.equal(h.find('input','Recipient email').props.disabled,true);assert.equal(h.find('textarea','Private invitation link'),undefined);
 h.find('button','Retry invitation request').props.onClick();await tick();h.render();assert.equal(calls.length,2);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),JSON.parse(JSON.stringify(calls[1])));assert.equal(calls[0][1].token,token);assert.ok(h.find('textarea','Private invitation link').props.value.endsWith('#invite='+token));
 h.invalidate();h.render();assert.equal(JSON.stringify(h.elements()).includes(token),false);assert.equal(JSON.stringify(h.elements()).includes('intended@example.test'),false);
});
test('actual recipient previews without accepting, cancels and ignores late private preview after invalidation',async()=>{
 let finish,accepted=0;const h=await componentHarness('MerchantInvitationRecipient',{preview:()=>new Promise(done=>{finish=done;}),accept:async()=>{accepted++;return{ok:true,data:{}};}});
 h.find('button','Review invitation').props.onClick();h.render();h.invalidate();finish({ok:true,data:{name:'Private company',role:'clerk',branches:[],branchIds:[],expiresAt:'2099'}});await tick();h.render();assert.equal(JSON.stringify(h.elements()).includes('Private company'),false);assert.equal(accepted,0);assert.equal(h.location.hash,'');
 const cancel=await componentHarness('MerchantInvitationRecipient',{preview:async()=>({ok:true,data:{name:'Private company',role:'clerk',branches:[],branchIds:[],expiresAt:'2099'}}),accept:async()=>{accepted++;return{ok:true,data:{}};}});cancel.find('button','Review invitation').props.onClick();await tick();cancel.render();cancel.find('button','Cancel invitation').props.onClick();cancel.render();assert.equal(accepted,0);assert.equal(JSON.stringify(cancel.elements()).includes('Private company'),false);
});
test('recipient survives StrictMode setup replay while account invalidation still discards the private fragment',async()=>{
 const h=await componentHarness('MerchantInvitationRecipient');assert.ok(h.find('button','Review invitation'));h.replayEffects();assert.ok(h.find('button','Review invitation'));assert.equal(h.location.hash,'');h.invalidate();h.render();assert.equal(h.find('button','Review invitation'),undefined);
});
test('recipient can explicitly reopen the same link after cancelling without any acceptance or persisted token',async()=>{
 let accepted=0;const h=await componentHarness('MerchantInvitationRecipient',{preview:async()=>({ok:true,data:{name:'Private company',role:'clerk',branches:[],branchIds:[],expiresAt:'2099'}}),accept:async()=>{accepted++;return{ok:true,data:{}};}});h.find('button','Review invitation').props.onClick();await tick();h.render();h.find('button','Cancel invitation').props.onClick();h.render();assert.equal(h.find('button','Review invitation'),undefined);h.reopen();assert.ok(h.find('button','Review invitation'));assert.equal(accepted,0);assert.equal(h.location.hash,'');h.invalidate();h.render();h.reopen();assert.equal(h.find('button','Review invitation'),undefined);
});
test('recipient unknown outcome retains original acceptance request even when a different fragment is reopened',async()=>{
 const calls=[];const h=await componentHarness('MerchantInvitationRecipient',{preview:async()=>({ok:true,data:{name:'Private company',role:'clerk',branches:[],branchIds:[],expiresAt:'2099'}}),accept:async(...args)=>{calls.push(args);return calls.length===1?{ok:false,code:'UNAVAILABLE'}:{ok:true,data:{merchantId:company,status:'accepted'}};}});
 h.find('button','Review invitation').props.onClick();await tick();h.render();h.find('button','Accept invitation').props.onClick();await tick();h.render();assert.equal(h.find('button','Cancel invitation').props.disabled,true);h.reopen('cd'.repeat(32));h.find('button','Retry invitation acceptance').props.onClick();await tick();h.render();assert.deepEqual(calls[1],calls[0]);assert.equal(calls[0][0],token);assert.equal(h.location.hash,'');assert.ok(JSON.stringify(h.elements()).includes('Invitation accepted and current company access confirmed.'));h.invalidate();h.render();assert.equal(JSON.stringify(h.elements()).includes('Invitation accepted and current company access confirmed.'),false);
});
test('owner late creation acknowledgement cannot restore a private invitation link after account invalidation',async()=>{
 let finish;const h=await componentHarness('MerchantInvitations',{command:()=>new Promise(done=>{finish=done;})});for(const [name,value] of [['Recipient email','intended@example.test'],['Private invitation label','Colleague'],['Invitation reason','Reviewed by owner']]){h.find(name==='Invitation reason'?'textarea':'input',name).props.onChange({target:{value}});h.render();}h.find('form','Invitation form').props.onSubmit({preventDefault(){}});h.invalidate();h.render();finish({ok:true,data:{id:requestId,status:'pending',expiresAt:'2099'}});await tick();h.render();assert.equal(h.find('textarea','Private invitation link'),undefined);assert.equal(JSON.stringify(h.elements()).includes(token),false);
});
test('owner cannot create an invitation when its private directory contract is unavailable, but can refresh',async()=>{
 let calls=0;const h=await componentHarness('MerchantInvitations',{list:async()=>({ok:false,code:'UNAVAILABLE'}),command:async()=>{calls++;return{ok:true,data:{}};}});assert.equal(h.find('input','Recipient email').props.disabled,true);assert.equal(h.find('button','Create private invitation').props.disabled,true);assert.equal(h.find('button','Refresh invitations').props.disabled,false);h.find('form','Invitation form').props.onSubmit({preventDefault(){}});await tick();assert.equal(calls,0);
});
