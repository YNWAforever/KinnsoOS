import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlLiteral,parseSupabaseStatus,createSupabaseFixtureAdapter} from './live-auth.mjs';

test('SQL literals are deterministic and reject control characters or oversized values',()=>{
  assert.equal(sqlLiteral("merchant's"),"'merchant''s'");
  assert.equal(sqlLiteral('uuid-value'),"'uuid-value'");
  assert.throws(()=>sqlLiteral('bad\u0000value'),{code:'SQL_VALUE_INVALID'});
  assert.throws(()=>sqlLiteral('x'.repeat(1001)),{code:'SQL_VALUE_INVALID'});
});

test('status parser accepts only exact loopback endpoints and never returns tokens in public metadata',()=>{
  const raw=JSON.stringify({API_URL:'http://127.0.0.1:60021',ANON_KEY:'a'.repeat(40),SERVICE_ROLE_KEY:'b'.repeat(40),
    DB_URL:'postgresql://postgres:secret@127.0.0.1:60022/postgres'});
  const parsed=parseSupabaseStatus(raw,'http://127.0.0.1:60021');
  assert.equal(parsed.apiUrl,'http://127.0.0.1:60021');assert.equal(parsed.dbPort,'60022');
  assert.equal(JSON.stringify(parsed.publicView).includes('secret'),false);
  for(const delta of [{API_URL:'https://example.test'},{DB_URL:'postgresql://db.test/postgres'},{SERVICE_ROLE_KEY:''}])
    assert.throws(()=>parseSupabaseStatus(JSON.stringify({...JSON.parse(raw),...delta}),'http://127.0.0.1:60021'),{code:'LOCAL_CREDENTIALS_INVALID'});
});

test('live adapter writes only validated synthetic rows through injected admin and SQL ports',async()=>{
  const calls=[];
  const admin={auth:{admin:{async createUser(value){calls.push(['createUser',value.email]);return {data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null};},
    async deleteUser(id){calls.push(['deleteUser',id]);return {error:null};}}},
    from(table){
      const chain={data:{id:'11111111-1111-4111-8111-111111111111'},error:null,
        update(value){calls.push(['update',table,value]);return chain;},
        insert(value){calls.push(['insert',table,value]);return chain;},
        eq(){return chain;},select(){return chain;},async single(){return chain;}};
      return chain;
    }};
  const adapter=createSupabaseFixtureAdapter({admin,sql:async(text)=>{calls.push(['sql',text]);return [];}});
  const email='na-8bce2805-c3e8-44f5-831e-805be1727c96-creator@example.test';
  const user=await adapter.createUser({email,password:'x'.repeat(24)});
  assert.equal(user.id,'11111111-1111-4111-8111-111111111111');
  await adapter.updateCreator({id:user.id,status:'active',displayName:'Creator A'});
  await adapter.insertMerchant({id:'22222222-2222-4222-8222-222222222222',userId:user.id,companyKey:'A',companyName:'Synthetic',contactEmail:email,status:'active'});
  await adapter.insertBranch({id:'33333333-3333-4333-8333-333333333333',merchantId:'22222222-2222-4222-8222-222222222222',merchantKey:'A',locationKey:'A1',name:'A1',active:true});
  await adapter.insertMember({merchantId:'22222222-2222-4222-8222-222222222222',merchantKey:'A',userId:user.id,role:'marketing',branchIds:['33333333-3333-4333-8333-333333333333'],active:true});
  await adapter.insertOps({userId:user.id,displayName:'Ops',role:'admin',status:'active'});
  await adapter.revokeSessions(user.id);
  assert(calls.some(x=>x[0]==='update'&&x[1]==='creators'));
  assert.equal(calls.filter(x=>x[0]==='sql').length,3);
});

test('adapter refuses a control character before issuing SQL',async()=>{
  let sqls=0,adapter=createSupabaseFixtureAdapter({admin:{},sql:async()=>{sqls++;return [];}});
  await assert.rejects(adapter.insertBranch({id:'33333333-3333-4333-8333-333333333333',merchantId:'22222222-2222-4222-8222-222222222222',
    merchantKey:'A',locationKey:'bad',name:'A1\u0000',active:true}),/SQL_VALUE_INVALID/);
  assert.equal(sqls,0);
});
