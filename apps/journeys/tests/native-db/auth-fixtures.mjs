import {randomBytes,randomUUID} from 'node:crypto';
import {Blocked,gate} from './target.mjs';

const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const requiredAdapter=['createUser','signIn','updateCreator','insertMerchant','insertBranch','insertMember','insertOps','revokeSessions','deleteUser'];

export function actorPlan(runId){
  gate(uuidPattern.test(runId??''),'RUN_ID_INVALID');
  const prefix=`na-${runId}-`;
  return [
    {name:'travellerA',kind:'traveller',email:prefix+'traveller-a@example.test'},
    {name:'travellerB',kind:'traveller',email:prefix+'traveller-b@example.test'},
    {name:'creatorA',kind:'creator',email:prefix+'creator-a@example.test',creatorStatus:'active'},
    {name:'creatorB',kind:'creator',email:prefix+'creator-b@example.test',creatorStatus:'active'},
    {name:'merchantA',kind:'merchant',email:prefix+'merchant-a@example.test',companyKey:'A',locations:['A1','A2']},
    {name:'merchantB',kind:'merchant',email:prefix+'merchant-b@example.test',companyKey:'B',locations:['B1']},
    {name:'memberA',kind:'member',email:prefix+'member-a@example.test',companyKey:'A',locations:['A1'],memberRole:'marketing'},
    {name:'ops',kind:'ops',email:prefix+'ops@example.test',opsRole:'admin'},
    {name:'invalidCreator',kind:'creator',email:prefix+'invalid-creator@example.test',creatorStatus:'suspended'}
  ].map(value=>Object.freeze(value));
}

export async function createAuthFixtures({admin,runId,passwordFactory=()=>`Na!${randomBytes(24).toString('base64url')}`}){
  gate(admin&&requiredAdapter.every(key=>typeof admin[key]==='function'),'FIXTURE_ADAPTER_INVALID');
  const plan=actorPlan(runId),created=[],actors={},credentials=new Map(),publicActors={};
  const companies={},branches={};
  let cleaned=false,cleaning=null;
  async function cleanup(){
    if(cleaned)return;
    if(cleaning)return cleaning;
    cleaning=(async()=>{
      const failures=[];
      for(const id of [...created].reverse()){
        try{await admin.revokeSessions(id);}catch(error){failures.push(error);}
        try{await admin.deleteUser(id);created.splice(created.indexOf(id),1);}catch(error){failures.push(error);}
      }
      if(failures.length)throw new Blocked('FIXTURE_CLEANUP_FAILED');
      cleaned=true;
    })();
    try{return await cleaning;}finally{cleaning=null;}
  }
  try{
    for(const spec of plan){
      const password=passwordFactory(spec);
      gate(typeof password==='string'&&password.length>=20,'FIXTURE_PASSWORD_INVALID');
      const user=await admin.createUser({email:spec.email,password,emailConfirm:true});
      gate(uuidPattern.test(user?.id??''),'FIXTURE_USER_INVALID');
      created.push(user.id);
      const session=await admin.signIn({email:spec.email,password});
      gate(session?.id===user.id&&session.client,'FIXTURE_SESSION_INVALID');
      credentials.set(spec.name,{email:spec.email,password});
      actors[spec.name]=Object.freeze({id:user.id,kind:spec.kind,client:session.client});
      publicActors[spec.name]={id:user.id,kind:spec.kind,email:spec.email};
      if(spec.creatorStatus)await admin.updateCreator({id:user.id,status:spec.creatorStatus,displayName:`Synthetic ${spec.name}`});
      if(spec.kind==='merchant'){
        const id=randomUUID(),companyKey=spec.companyKey;
        await admin.insertMerchant({id,userId:user.id,companyKey,companyName:`Synthetic merchant ${companyKey}`,contactEmail:spec.email,status:'active'});
        companies[companyKey]=id;
        branches[companyKey]={};
        for(const location of spec.locations){
          const branchId=randomUUID();
          await admin.insertBranch({id:branchId,merchantId:id,merchantKey:companyKey,locationKey:location,name:`Synthetic location ${location}`,active:true});
          branches[companyKey][location]=branchId;
        }
      }
    }
    const merchantA=actors.merchantA.id,memberA=actors.memberA.id;
    await admin.insertMember({merchantId:companies.A,merchantKey:'A',userId:memberA,role:'marketing',branchIds:[branches.A.A1],active:true});
    await admin.insertOps({userId:actors.ops.id,displayName:'Synthetic NA ops',role:'admin',status:'active'});

    async function revokeActor(name){
      const actor=actors[name];gate(actor&&actor.kind!=='ops'||name==='ops','UNKNOWN_FIXTURE_ACTOR');
      await admin.revokeSessions(actor.id);
      return actor;
    }
    return Object.freeze({
      runId,actors:Object.freeze(actors),merchantA,companies:Object.freeze(companies),branches:Object.freeze(branches),
      revokeActor,cleanup,
      publicView:()=>structuredClone({runId,actors:publicActors,companies,branches})
    });
  }catch(error){
    let cleanupFailed=false;
    try{await cleanup();}catch{cleanupFailed=true;}
    if(cleanupFailed){const blocked=new Blocked('FIXTURE_SETUP_AND_CLEANUP_FAILED');blocked.fixtureCleanup=cleanup;throw blocked;}
    if(error instanceof Blocked)throw error;
    throw new Blocked('FIXTURE_SETUP_FAILED');
  }
}
