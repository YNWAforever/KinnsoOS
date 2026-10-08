import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {transform} from 'esbuild';
const helper=await import('../lib/merchants/access.ts').catch(()=>({}));
const branches=[{id:'branchA',name:'Central',active:true},{id:'branchB',name:'Archived',active:false}];
test('commission percentages preserve mature values and reject silent rounding or empty-to-zero',()=>{
 assert.equal(typeof helper.parseCommissionPercent,'function');
 for(const [input,expected] of [['70',70],['0.70',0.70],['0',0],['999999.99',999999.99]])assert.equal(helper.parseCommissionPercent(input),expected);
 for(const input of ['', ' ', '-1','NaN','Infinity','1e3','0.001','1000000','1.2.3'])assert.equal(helper.parseCommissionPercent(input),null);
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const source=await readFile(new URL('../app/travel/MerchantTeamAccess.tsx',import.meta.url),'utf8');
const compiled=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic',target:'es2022'});
function harness(port){const states=[],refs=[],effects=[];let cursor=0,changed=false,tree,invalidator;let props={actorId:'actor-A',merchantId:'company-A',branches:[{id:'branchA',name:'Central'}],refreshKey:0,locked:false,onSave:port.save??(async()=>{}),onDenied:port.denied??(()=>{})};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;changed=true;}];},useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},useEffect(work,deps){const i=cursor++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects[i]={deps,work,pending:true,cleanup:old?.cleanup};}};
 const jsx=(type,props)=>({type,props}),module={exports:{}};runInContext(compiled.code,createContext({module,exports:module.exports,require:name=>{if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='./ui')return{useApp:()=>({t:en=>en})};if(name==='../../lib/trips/local-drafts')return{subscribeAccountInvalidation:fn=>{invalidator=fn;return()=>{};}};if(name==='../../lib/merchants/repository')return{merchantTeam:port.read};if(name==='../../lib/merchants/access')return helper;throw Error('Unexpected dependency '+name);}}));
 function render(){for(let n=0;n<8;n++){cursor=0;changed=false;tree=module.exports.MerchantTeamAccess(props);for(const effect of effects)if(effect?.pending){effect.pending=false;effect.cleanup?.();effect.cleanup=effect.work();}if(!changed)break;}return tree;}
 function elements(node){if(arguments.length===0)node=tree;return!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(child=>elements(child))];}
 const find=(type,label)=>elements().find(x=>x.type===type&&(x.props['aria-label']===label||x.props.children===label));render();return{render,elements,find,invalidate:()=>invalidator?.(null),scope:merchantId=>{props={...props,merchantId};render();}};
}
const member={userId:'member-A',name:'Company colleague',role:'clerk',active:true,branchIds:['branchA','archived'],branches:[{id:'branchA',name:'Central',active:true},{id:'archived',name:'Former branch',active:false}]};
test('actual team editor selects only server members, warns until explicit branch removal and cancels edits',async()=>{
 const commands=[];const h=harness({read:async()=>({ok:true,data:{members:[member],nextCursor:null}}),save:async command=>{commands.push(command);}});await tick();h.render();h.find('select','Existing team member').props.onChange({target:{value:'member-A'}});h.render();assert.ok(h.find('button','Remove unavailable branch'));assert.equal(h.find('button','Save team access').props.disabled,true);
 h.find('button','Remove unavailable branch').props.onClick();h.elements().find(x=>x.type==='textarea').props.onChange({target:{value:'  Owner reviewed scope  '}});h.render();assert.equal(h.find('button','Save team access').props.disabled,false);h.elements().find(x=>x.type==='form').props.onSubmit({preventDefault(){}});await tick();assert.deepEqual(JSON.parse(JSON.stringify(commands)),[{type:'setMember',userId:'member-A',role:'clerk',branchIds:['branchA'],active:true,reason:'Owner reviewed scope'}]);
 h.find('button','Cancel team edits').props.onClick();h.render();assert.equal(h.find('select','Existing team member').props.value,'');assert.equal(h.find('button','Save team access'),undefined);h.find('select','Existing team member').props.onChange({target:{value:'foreign-user'}});h.render();assert.equal(h.find('button','Save team access'),undefined);assert.equal(commands.length,1);
});
test('actual team editor discards late private reads after account or company changes and forwards authoritative denial',async()=>{
 let resolve;const h=harness({read:()=>new Promise(done=>{resolve=done;})});h.invalidate();h.render();resolve({ok:true,data:{members:[member],nextCursor:null}});await tick();h.render();assert.equal(JSON.stringify(h.elements()).includes('Company colleague'),false);
 let old;const calls=[];const scoped=harness({read:id=>{calls.push(id);return id==='company-A'?new Promise(done=>{old=done;}):Promise.resolve({ok:true,data:{members:[],nextCursor:null}});}});scoped.scope('company-B');await tick();old({ok:true,data:{members:[member],nextCursor:null}});await tick();scoped.render();assert.deepEqual(calls,['company-A','company-B']);assert.equal(JSON.stringify(scoped.elements()).includes('Company colleague'),false);
 const denied=[];const revoked=harness({read:async()=>({ok:false,code:'FORBIDDEN'}),denied:code=>denied.push(code)});await tick();revoked.render();assert.deepEqual(denied,['FORBIDDEN']);assert.equal(revoked.find('select','Existing team member'),undefined);
});
test('actual directory route rejects private/duplicate/invalid criteria before RPC and preserves server denial or unavailable',async()=>{
 const code=await transform(await readFile(new URL('../app/api/merchant/team/route.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'});const validation=await import('../lib/api/validation.ts');const module={exports:{}};const calls=[];let denied=false,throws=false;
 runInContext(code.code,createContext({module,exports:module.exports,URL,require:name=>{if(name==='../../../../lib/api/validation')return validation;if(name==='../../../../lib/api/server')return{apiContext:async()=>denied?{response:new Response('{}',{status:403})}:{client:{rpc:async(...args)=>{calls.push(args);if(throws)throw Error('Unavailable');return{data:{members:[],nextCursor:null},error:null};}}},failure:(_code,status)=>new Response('{}',{status}),reply:body=>Response.json(body),backendFailure:()=>new Response('{}',{status:503})};throw Error('Unexpected dependency '+name);}}));
 const company='11111111-1111-4111-8111-111111111111';for(const query of ['', 'id=invalid','id='+company+'&email=private@example.test','id='+company+'&id='+company,'id='+company+'&after='])assert.equal((await module.exports.GET(new Request('https://local.test/api/merchant/team?'+query))).status,400);assert.equal(calls.length,0);
 denied=true;assert.equal((await module.exports.GET(new Request('https://local.test/api/merchant/team?id='+company))).status,403);assert.equal(calls.length,0);denied=false;assert.equal((await module.exports.GET(new Request('https://local.test/api/merchant/team?id='+company))).status,200);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),['get_kinnso_merchant_team',{p_merchant_id:company,p_after:null}]);throws=true;assert.equal((await module.exports.GET(new Request('https://local.test/api/merchant/team?id='+company))).status,503);
});
test('member preview explains scoped permissions and never grants unavailable branch or inactive access',()=>{
 assert.equal(typeof helper.previewMemberAccess,'function');
 const clerk=helper.previewMemberAccess('clerk',true,['branchA'],branches);assert.equal(clerk.valid,true);assert.equal(clerk.canRedeem,true);assert.equal(clerk.canPublish,false);assert.equal(clerk.canReadFinance,false);assert.deepEqual(clerk.branchNames,['Central']);
 const finance=helper.previewMemberAccess('finance',true,['branchA'],branches);assert.equal(finance.canRedeem,false);assert.equal(finance.canReadFinance,true);assert.deepEqual(finance.branchNames,['Central']);
 assert.equal(helper.previewMemberAccess('marketing',true,[],branches).canPublish,true);
 const inactive=helper.previewMemberAccess('clerk',false,['branchA'],branches);assert.equal(inactive.canRedeem,false);assert.equal(inactive.canReadFinance,false);
 const unavailable=helper.previewMemberAccess('clerk',true,['branchB','foreign'],branches);assert.equal(unavailable.valid,false);assert.equal(unavailable.canRedeem,false);assert.deepEqual(unavailable.unavailableBranchIds,['branchB','foreign']);
 assert.equal(helper.previewMemberAccess('owner',true,['branchA'],branches).valid,false);
 assert.equal(helper.previewMemberAccess('clerk',true,['branchA','branchA'],branches).valid,false);
});
