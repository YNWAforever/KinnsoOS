import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
// Explicit local projects only; CI keeps its original volume, pilot uses a new one.
export const approvedLocalProjects = Object.freeze(['kinnsoos-b1-20261002','kinnsoos-pilot-20261013']);
/** @param {Record<string,string|undefined>} [env] */
export function testTargetConfiguration(env = process.env, {allowCanonicalCi = false} = {}) {
  const canonical=allowCanonicalCi&&env.CI==='true'&&env.KINNSO_TEST_PROJECT==='kinnso-v3';
  const origin=canonical?'http://127.0.0.1:54421':'http://127.0.0.1:58421';
  if (env.KINNSO_TEST_TARGET !== 'local' || !(approvedLocalProjects.includes(env.KINNSO_TEST_PROJECT)||canonical) ||
    env.KINNSO_TEST_API_ORIGIN !== origin ||
    env.KINNSO_TEST_DB_CONTAINER !== 'supabase_db_' + env.KINNSO_TEST_PROJECT ||
    env.SUPABASE_URL !== origin ||
    ['KINNSO_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','KINNSO_APPROVED_SUPABASE_ORIGIN','KINNSO_LEGACY_AUTH_ORIGIN'].some(key=>env[key]&&env[key]!==origin) ||
    (env.SUPABASE_DB_CONTAINER&&env.SUPABASE_DB_CONTAINER!==env.KINNSO_TEST_DB_CONTAINER)) {
    throw new Error('BLOCKED: integration target is missing or is not the approved isolated local project');
  }
  return { environment: 'local', projectRef: String(env.KINNSO_TEST_PROJECT),
    apiOrigin: String(env.KINNSO_TEST_API_ORIGIN), dbContainer: String(env.KINNSO_TEST_DB_CONTAINER) };
}
/** Attest the actual connection path before constructing any client. Never expose Docker env/stderr.
 * @param {Record<string,string|undefined>} [env]
 */
export function verifyTestTarget(env = process.env, run = execFileSync, options = {}) {
 const target=testTargetConfiguration(env,options),project=target.projectRef;
 const names=['db','kong','rest','auth'].map(kind=>'supabase_'+kind+'_'+project);
 const blocked=()=>{throw Error('BLOCKED: actual isolated test target identity could not be verified')};
 try {
  const execute=args=>String(run('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000,windowsHide:true,maxBuffer:2*1024*1024}));
  const containers=JSON.parse(execute(['inspect',...names]));
  if(!Array.isArray(containers)||containers.length!==4)blocked();
  const [db,kong,rest,auth]=names.map(name=>containers.find(value=>value.Name==='/'+name));
  const network='supabase_network_'+project,networkId=db?.NetworkSettings?.Networks?.[network]?.NetworkID;
  if(!networkId)blocked();
  for(const container of [db,kong,rest,auth]){
   if(!container?.State?.Running||!/^[a-f0-9]{64}$/.test(container.Id)||
    container.Config?.Labels?.['com.supabase.cli.project']!==project||
    container.Config?.Labels?.['com.docker.compose.project']!==project||
    Object.keys(container.NetworkSettings?.Networks??{}).length!==1||
    container.NetworkSettings.Networks[network]?.NetworkID!==networkId)blocked();
  }
  if(!db.Mounts?.some(mount=>mount.Type==='volume'&&mount.Name===target.dbContainer&&mount.Destination==='/var/lib/postgresql/data'))blocked();
  const port=new URL(target.apiOrigin).port;
  const bindings=kong.NetworkSettings.Ports?.['8000/tcp'];
  if(!bindings?.length||bindings.some(binding=>binding.HostPort!==port||!['127.0.0.1','0.0.0.0','::','::1'].includes(binding.HostIp)))blocked();
  const owners=execute(['ps','--no-trunc','--filter','publish='+port,'--format','{{.ID}} {{.Names}}']).trim().split(/\r?\n/);
  if(owners.length!==1||owners[0]!==kong.Id+' '+names[1])blocked();
  const setting=(container,key)=>{
   const values=container.Config.Env.filter(value=>value.startsWith(key+'='));
   if(values.length!==1)blocked();
   return values[0].slice(key.length+1);
  };
  for(const [container,key] of [[rest,'PGRST_DB_URI'],[auth,'GOTRUE_DB_DATABASE_URL']]){
   const uri=new URL(setting(container,key));
   if(!['postgres:','postgresql:'].includes(uri.protocol)||uri.hostname!==names[0]||uri.port!=='5432'||uri.pathname!=='/postgres'||uri.search||uri.hash)blocked();
  }
  if(setting(kong,'KONG_DECLARATIVE_CONFIG')!=='/home/kong/kong.yml')blocked();
  const config=execute(['exec',names[1],'cat','/home/kong/kong.yml']);
  if(/^[ \t]*paths:[ \t]*\S/m.test(config))blocked();
  // Only the CLI's explicit service blocks are accepted; an unfamiliar config fails closed.
  const services=config.split(/^  - name: /m).slice(1).map(block=>({
   name:block.split(/\r?\n/)[0],
   urls:[...block.matchAll(/^    url: (\S+)\s*$/gm)].map(match=>match[1]),
   paths:[...block.matchAll(/^          - (\S+)\s*$/gm)].map(match=>match[1]),
  }));
  for(const service of services)for(const route of service.paths){
   if(!route.startsWith('/')||/[\\%~]/.test(route))blocked();
   for(const [prefix,host,servicePort] of [['/auth/v1/',names[3],'9999'],['/rest/v1/',names[2],'3000']]){
    if(!route.startsWith(prefix)&&!prefix.startsWith(route))continue;
    if(service.urls.length!==1)blocked();
    const upstream=new URL(service.urls[0]);
    if(upstream.protocol!=='http:'||upstream.hostname!==host||upstream.port!==servicePort||upstream.username||upstream.password||upstream.search||upstream.hash)blocked();
   }
  }
  for(const [path,name,host,servicePort] of [['/auth/v1/','auth-v1',names[3],'9999'],['/rest/v1/','rest-v1',names[2],'3000']]){
   const matches=services.filter(service=>service.paths.includes(path));
   if(matches.length!==1||matches[0].name!==name||matches[0].urls.length!==1)blocked();
   const upstream=new URL(matches[0].urls[0]);
   if(upstream.protocol!=='http:'||upstream.hostname!==host||upstream.port!==servicePort||upstream.pathname!=='/'||upstream.username||upstream.password||upstream.search||upstream.hash)blocked();
  }
  return {...target,identity:{dbId:db.Id,gatewayId:kong.Id,restId:rest.Id,authId:auth.Id,networkId,volume:target.dbContainer}};
 }catch{throw Error('BLOCKED: actual isolated test target identity could not be verified');}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyTestTarget();
  console.log('Isolated local test target verified');
}
