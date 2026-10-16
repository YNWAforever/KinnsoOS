export const pilot = 'kinnsoos-pilot-20261013';
export function targetEnv(project = pilot) {
 return {KINNSO_TEST_TARGET:'local',KINNSO_TEST_PROJECT:project,KINNSO_TEST_API_ORIGIN:'http://127.0.0.1:58421',
  KINNSO_TEST_DB_CONTAINER:'supabase_db_'+project,SUPABASE_URL:'http://127.0.0.1:58421'};
}
export function runtimeFixture(project = pilot) {
 const network='supabase_network_'+project;
 const containers=['db','kong','rest','auth'].map((kind,index)=>({
  Id:String(index+1).repeat(64),Name:'/supabase_'+kind+'_'+project,State:{Running:true},
  Config:{Labels:{'com.supabase.cli.project':project,'com.docker.compose.project':project},Env:
   kind==='kong'?['KONG_DECLARATIVE_CONFIG=/home/kong/kong.yml']:
   kind==='rest'?['PGRST_DB_URI=postgresql://role:secret@supabase_db_'+project+':5432/postgres']:
   kind==='auth'?['GOTRUE_DB_DATABASE_URL=postgresql://role:secret@supabase_db_'+project+':5432/postgres']:[]},
  NetworkSettings:{Networks:{[network]:{NetworkID:'a'.repeat(64)}},Ports:kind==='kong'?{'8000/tcp':[{HostIp:'0.0.0.0',HostPort:'58421'}]}:{}},
  Mounts:kind==='db'?[{Type:'volume',Name:'supabase_db_'+project,Destination:'/var/lib/postgresql/data'}]:[],
 }));
 let config=`services:
  - name: auth-v1
    url: http://supabase_auth_${project}:9999/
    routes:
      - name: auth-v1-all
        paths:
          - /auth/v1/
  - name: rest-v1
    url: http://supabase_rest_${project}:3000/
    routes:
      - name: rest-v1-all
        paths:
          - /rest/v1/
`;
 let owners=containers[1].Id+' supabase_kong_'+project+'\n';
 const calls=[];
 const run=(command,args)=>{
  calls.push([command,...args]);
  if(command!=='docker')throw Error('Unexpected command');
  if(args[0]==='inspect')return JSON.stringify(containers);
  if(args[0]==='ps')return owners;
  if(args[0]==='exec')return config;
  throw Error('Unexpected Docker action');
 };
 return {containers,run,calls,setConfig:value=>{config=value},config:()=>config,setOwners:value=>{owners=value}};
}
