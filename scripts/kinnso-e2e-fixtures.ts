import {loadEnvFile} from 'node:process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {assertNonProductionTarget} from './verify-kinnso-target'
loadEnvFile('apps/web/.env.test')
const evidence = new URL('../evidence/local-fixtures/', import.meta.url)
mkdirSync(evidence, {recursive:true})
assertNonProductionTarget(process.env)
if(process.env.KINNSO_TEST_PROJECT!=='kinnsoos-b1-20261002')throw new Error('BLOCKED: this fixture runner owns only the isolated KinnsoOS local project')
try{
 const seed=readFileSync('supabase/seed.sql','utf8'),marker='-- Phase R7.1 deterministic local funnel fixtures (never used by hosted environments).'
 if(seed.split(marker).length!==2)throw new Error('Fixture section not recognized')
 const quality=process.argv.includes('--quality-clean')
 const input=quality?"begin; delete from auth.users where id in ('00000000-0000-0000-0000-000000000701'::uuid,'00000000-0000-0000-0000-000000000702'::uuid); commit;":'begin;\n'+marker+seed.split(marker)[1]+'\ncommit;\n'
 const result=execFileSync('docker',['exec','-i',process.env.SUPABASE_DB_CONTAINER!,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']})
 writeFileSync(new URL('e2e-fixtures.log',evidence),result)
 console.log(quality?'Only the two recognized synthetic browser users removed before quality tests on the verified local project':'Existing synthetic seed fixtures restored on the verified dedicated local project; no remote target used')
}catch(error){const detail=error as {stderr?:Buffer|string};writeFileSync(new URL('e2e-fixtures-error.log',evidence),String(detail.stderr??'unknown local error'));console.error('Local fixture provisioning failed; inspect the private local log');process.exitCode=1}
