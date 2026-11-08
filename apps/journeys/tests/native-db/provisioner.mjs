import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Blocked,gate} from './target.mjs';
import {createIsolatedConfig,ownedRunDirectory} from './live-support.mjs';
import {cliEnvironment} from './inventory.mjs';
import {run,engineHost} from './docker-runtime.mjs';
import {resolveCachedCli} from './workspace.mjs';

const excludes='analytics,edge-runtime,functions,imgproxy,inbucket,meta,realtime,storage,studio,vector';
export async function prepareOwnedRunDirectory(root,runId){
  const runDir=ownedRunDirectory(root,runId);
  try{await stat(runDir);throw new Blocked('RUN_DIRECTORY_ALREADY_EXISTS');}catch(error){if(error instanceof Blocked)throw error;if(error.code!=='ENOENT')throw error;}
  await mkdir(runDir,{recursive:true,mode:0o700});
  return runDir;
}
export function createProvisionCommands(plan,configDir,cliEntry){
  const privateRoot=path.resolve(configDir,'..');
  gate(plan?.ports?.api===60021&&plan.ports.db===60022&&plan.ports.shadow===60020&&plan.apiOrigin==='http://127.0.0.1:60021','PROVISION_PLAN_INVALID');
  gate(privateRoot.split(path.sep).includes('.local-private')&&path.basename(privateRoot)===plan.runId,'PROVISION_PATH_INVALID');
  const network=`supabase_network_${plan.project}`,volume=`supabase_db_${plan.project}`,labels=['--label',`org.kinnso.na.project=${plan.project}`,'--label',`org.kinnso.na.run=${plan.runId}`];
  return Object.freeze([
    Object.freeze({file:'docker',args:Object.freeze(['network','create','--internal',...labels,network])}),
    Object.freeze({file:'docker',args:Object.freeze(['volume','create','--label',`com.supabase.cli.project=${plan.project}`,...labels,volume])}),
    Object.freeze({file:process.execPath,args:Object.freeze([cliEntry,'start','--workdir',configDir,'--network-id',network,'--exclude',excludes,'--output','json','--yes']),
      env:cliEnvironment(process.env)})
  ]);
}

async function cliEntry(root){
  return resolveCachedCli(root);
}

export async function provisionIsolatedStack(root,plan,preflight){
  gate(preflight?.status==='PREFLIGHT_PASS','PREFLIGHT_RECEIPT_REQUIRED');
  const runDir=await prepareOwnedRunDirectory(root,plan.runId),configDir=path.join(runDir,'supabase'),configFile=path.join(configDir,'config.toml');
  await mkdir(configDir,{recursive:false,mode:0o700});
  const sourceConfig=await readFile(path.join(root,'supabase/config.toml'),'utf8');
  await writeFile(configFile,createIsolatedConfig(sourceConfig,plan),{mode:0o600});
  const commands=createProvisionCommands(plan,configDir,await cliEntry(root));
  const started=[],created=[];
  try{
    for(const command of commands){
      started.push(command);
      const result=await run(command.file,command.args,{env:command.env,timeout:command.file==='docker'?30000:10*60*1000});
      if(command.args[0]==='network'||command.args[0]==='volume')created.push(command.args[0]);
      if(command.args.includes('start')){
        // The status body contains local keys. Keep it only long enough to verify
        // the exact loopback endpoints; never persist or return it.
        const status=JSON.parse(result.stdout);
        gate(status.API_URL===plan.apiOrigin,'PROVISION_STATUS_MISMATCH');
      }
    }
    return Object.freeze({status:'STARTED',runId:plan.runId,configDir,network:`supabase_network_${plan.project}`,volume:`supabase_db_${plan.project}`});
  }catch(error){
    const cleanupErrors=[];
    const cli=await cliEntry(root).catch(()=>null);
    // Only stop a stack this run actually tried to start. Before `start` there is
    // no owned stack, and `--no-backup` would delete a same-project volume.
    const startAttempted=started.some(command=>command.args.includes('start'));
    if(cli&&startAttempted)await run(process.execPath,[cli,'stop','--workdir',configDir,'--no-backup','--yes'],{env:cliEnvironment(process.env),timeout:120000}).catch(e=>cleanupErrors.push(e));
    const exists=async(kind,name)=>{
      const result=await run('docker',['--host',engineHost,kind,'ls','--filter',`name=${name}`,'--format','{{.Name}}'],{timeout:30000});
      return result.stdout.split(/\r?\n/).map(value=>value.trim()).includes(name);
    };
    if(created.includes('volume')&&await exists('volume',`supabase_db_${plan.project}`))
      await run('docker',['--host',engineHost,'volume','rm',`supabase_db_${plan.project}`],{timeout:30000}).catch(e=>cleanupErrors.push(e));
    if(created.includes('network')&&await exists('network',`supabase_network_${plan.project}`))
      await run('docker',['--host',engineHost,'network','rm',`supabase_network_${plan.project}`],{timeout:30000}).catch(e=>cleanupErrors.push(e));
    const blocked=new Blocked(cleanupErrors.length?'PROVISION_FAILED_CLEANUP_INCOMPLETE':'PROVISION_FAILED');
    blocked.startedCommands=started.length;
    throw blocked;
  }
}
