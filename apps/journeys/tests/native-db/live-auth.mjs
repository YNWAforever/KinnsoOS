import {Blocked,gate} from './target.mjs';
import {validateLocalCredentials} from './live-support.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function sqlLiteral(value){
  gate(typeof value==='string'&&value.length<=1000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),'SQL_VALUE_INVALID');
  return `'${value.replaceAll("'", "''")}'`;
}
export function parseSupabaseStatus(raw,expectedApiOrigin){
  let status;
  try{status=JSON.parse(raw);}catch{throw new Blocked('LOCAL_CREDENTIALS_INVALID');}
  const checked=validateLocalCredentials(status,expectedApiOrigin);
  return Object.freeze({...status,...checked,
    publicView:Object.freeze({apiUrl:checked.apiUrl,dbPort:checked.dbPort})});
}

function assertResult(result){
  if(result?.error)throw new Blocked('FIXTURE_DATABASE_OPERATION_FAILED');
  return result?.data;
}

export function createSupabaseFixtureAdapter({admin,sql,createClient,apiUrl,anonKey}){
  gate(admin&&typeof sql==='function'&&(createClient===undefined||typeof createClient==='function'),'FIXTURE_ADAPTER_INVALID');
  return {
    async createUser(input){
      gate(/^na-[a-f0-9-]{36}-[a-z-]+@example\.test$/.test(input?.email??'')&&typeof input.password==='string','FIXTURE_USER_INVALID');
      const result=await admin.auth.admin.createUser({email:input.email,password:input.password,email_confirm:true});
      const data=assertResult(result);gate(uuid.test(data?.user?.id??''),'FIXTURE_USER_INVALID');return {id:data.user.id};
    },
    async signIn({email,password}){
      gate(typeof createClient==='function'&&apiUrl&&anonKey,'FIXTURE_ADAPTER_INVALID');
      const client=createClient(apiUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const result=await client.auth.signInWithPassword({email,password});
      const data=assertResult(result);gate(uuid.test(data?.user?.id??'')&&data?.session?.access_token,'FIXTURE_SESSION_INVALID');
      return {id:data.user.id,client};
    },
    async updateCreator({id,status,displayName}){
      gate(uuid.test(id??'')&&['active','suspended','onboarding'].includes(status),'FIXTURE_CREATOR_INVALID');
      assertResult(await admin.from('creators').update({status,display_name:displayName}).eq('id',id).select('id').single());
    },
    async insertMerchant(row){
      gate(uuid.test(row?.id??'')&&uuid.test(row.userId??'')&&['A','B'].includes(row.companyKey),'FIXTURE_MERCHANT_INVALID');
      assertResult(await admin.from('merchant_profiles').insert({id:row.id,user_id:row.userId,company_name:row.companyName,
        contact_email:row.contactEmail,status:row.status}).select('id').single());
    },
    async insertBranch(row){
      gate(uuid.test(row?.id??'')&&uuid.test(row.merchantId??'')&&typeof row.name==='string','FIXTURE_BRANCH_INVALID');
      await sql(`insert into kinnso_internal.merchant_branches(id,merchant_id,name,active) values(${sqlLiteral(row.id)}::uuid,${sqlLiteral(row.merchantId)}::uuid,${sqlLiteral(row.name)},${row.active===true});`);
    },
    async insertMember(row){
      gate(uuid.test(row?.merchantId??'')&&uuid.test(row.userId??'')&&Array.isArray(row.branchIds)&&row.branchIds.every(id=>uuid.test(id)),'FIXTURE_MEMBER_INVALID');
      const branches='array['+row.branchIds.map(id=>sqlLiteral(id)+'::uuid').join(',')+']::uuid[]';
      await sql(`insert into kinnso_internal.merchant_members(merchant_id,user_id,role,branch_ids,active) values(${sqlLiteral(row.merchantId)}::uuid,${sqlLiteral(row.userId)}::uuid,${sqlLiteral(row.role)},${branches},${row.active===true});`);
    },
    async insertOps(row){
      gate(uuid.test(row?.userId??'')&&row.role==='admin','FIXTURE_OPS_INVALID');
      const result=await admin.from('kinnso_ops_members').insert({user_id:row.userId,display_name:row.displayName,role:row.role,status:row.status}).select('id').single();
      assertResult(result);
    },
    async revokeSessions(userId){
      gate(uuid.test(userId??''),'FIXTURE_USER_INVALID');
      await sql(`delete from auth.sessions where user_id=${sqlLiteral(userId)}::uuid;`);
    },
    async deleteUser(id){
      gate(uuid.test(id??''),'FIXTURE_USER_INVALID');assertResult(await admin.auth.admin.deleteUser(id));
    }
  };
}
