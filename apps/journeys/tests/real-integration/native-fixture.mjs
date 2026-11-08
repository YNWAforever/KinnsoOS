import {createClient} from '@supabase/supabase-js';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
export async function openFixture(){
 if(process.env.KINNSO_SUPABASE_URL!=='http://127.0.0.1:59621'||process.env.KINNSO_NATIVE_TEST_PROJECT!=='kinnsoos-suspension-it-20261105')throw Error('WRONG_TEST_TARGET');
 const url=process.env.KINNSO_SUPABASE_URL,options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,process.env.KINNSO_SUPABASE_SECRET_KEY,options),actors={},trips=[];
 const runId=randomUUID();
 for(const label of ['A','B']){
  const email=`release-${runId}-${label.toLowerCase()}@example.test`,credential=randomBytes(24).toString('base64url');
  const made=await admin.auth.admin.createUser({email,password:credential,email_confirm:true});
  if(made.error)throw Error('CREATE_TEST_USER_FAILED '+made.error.status);
  const client=createClient(url,process.env.KINNSO_SUPABASE_PUBLISHABLE_KEY,options);
  const auth=await client.auth.signInWithPassword({email,password:credential});
  if(auth.error)throw Error('TEST_LOGIN_FAILED '+auth.error.status);
  actors[label]={label,email,credential,id:made.data.user.id,client};
 }
 const rpc=async(actor,name,args)=>{const result=await actor.client.rpc(name,args);if(result.error)throw Error('TEST_RPC_FAILED '+name+' '+result.error.code);return result.data};
 const write=()=>writeFileSync(process.env.KINNSO_NATIVE_LEDGER,JSON.stringify({runId,users:Object.values(actors).map(a=>({id:a.id,label:a.label})),trips,retained:true},null,2));
 write();
 return {actors,write,create:async(actor,input)=>{const value=await rpc(actor,'create_trip_v2',{p_request_id:randomUUID(),p_payload:input??{title:'Synthetic isolated trip',timezone:'Asia/Hong_Kong',startDate:null}});trips.push(value.id);write();return{value}},snapshot:(actor,id)=>rpc(actor,'get_trip_snapshot',{p_trip_id:id})};
}
