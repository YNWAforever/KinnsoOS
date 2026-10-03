import {loadEnvFile} from 'node:process'
import {assertNonProductionTarget} from './verify-kinnso-target'
import {cleanupMedia} from '../apps/web/lib/media/service'
loadEnvFile('apps/web/.env.test')
assertNonProductionTarget(process.env)
async function main(){const result=await cleanupMedia(process.env);console.log(JSON.stringify({environment:'verified local',removed:result.removed}))}
void main().catch(()=>{console.error('Local media cleanup failed; no deletion acknowledgement recorded');process.exitCode=1})
