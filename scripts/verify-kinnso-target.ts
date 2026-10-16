import {execFileSync} from 'node:child_process'
import {verifyTestTarget,testTargetConfiguration} from '../apps/journeys/scripts/verify-test-target.mjs'
export function assertNonProductionTarget(env: Record<string, string | undefined>,run:typeof execFileSync=execFileSync) {
  const name='supabase_db_'+env.KINNSO_TEST_PROJECT,reference=env.SUPABASE_DB_CONTAINER??env.KINNSO_TEST_DB_CONTAINER
  const normalized={...env,KINNSO_TEST_API_ORIGIN:env.KINNSO_TEST_API_ORIGIN??env.SUPABASE_URL,
    KINNSO_TEST_DB_CONTAINER:env.KINNSO_TEST_DB_CONTAINER??name,SUPABASE_DB_CONTAINER:name}
  testTargetConfiguration(normalized,{allowCanonicalCi:true})
  let suppliedId:string|undefined
  if(reference!==name){
    if(!reference||!/^[a-f0-9]{12,64}$/.test(reference))throw Error('BLOCKED: invalid local database reference')
    try{
      const rows=JSON.parse(String(run('docker',['inspect',reference],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000,windowsHide:true})))
      if(rows.length!==1||rows[0].Name!=='/'+name||!rows[0].Id?.startsWith(reference))throw Error('mismatch')
      suppliedId=rows[0].Id
    }catch{throw Error('BLOCKED: supplied database ID does not identify the isolated project')}
  }
  const result=verifyTestTarget(normalized,run,{allowCanonicalCi:true})
  if(suppliedId&&result.identity.dbId!==suppliedId)throw Error('BLOCKED: database identity changed during verification')
  return result
}
