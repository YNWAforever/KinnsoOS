import {cookies} from 'next/headers';
import {serverClient} from '../supabase/server';
import {readRecoveryProof} from './recovery-proof';
export const RECOVERY_COOKIE='kinnso-recovery';
export async function currentRecovery(){
 const client=await serverClient();if(!client)return null;
 const {data,error}=await client.auth.getUser();if(error||!data.user)return null;
 const claims=await client.auth.getClaims();
 const sessionId=claims.data?.claims.session_id;
 if(claims.error||claims.data?.claims.sub!==data.user.id||typeof sessionId!=='string')return null;
 const jar=await cookies();
 const proof=readRecoveryProof(jar.get(RECOVERY_COOKIE)?.value,process.env.KINNSO_AUTH_RECOVERY_SECRET,{userId:data.user.id,sessionId});
 return proof?{client,proof}:null;
}
