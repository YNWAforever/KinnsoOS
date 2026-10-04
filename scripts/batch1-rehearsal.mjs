import {execFileSync} from 'node:child_process';import {readFileSync,writeFileSync,readdirSync,copyFileSync,mkdirSync} from 'node:fs';import {fileURLToPath,pathToFileURL,URL} from 'node:url';import process from 'node:process';import console from 'node:console';
const repo=fileURLToPath(new URL('../',import.meta.url)),workdir=process.env.KINNSO_LOCAL_STACK_DIR;
if(!workdir)throw new Error('BLOCKED: explicit verified local stack directory is required');
const evidenceDir=new URL('../evidence/rehearsal/',import.meta.url);mkdirSync(evidenceDir,{recursive:true});
const stack=pathToFileURL(workdir.replace(/[\\/]?$/,'/'));
const container='supabase_db_kinnsoos-b1-20261002',project='kinnsoos-b1-20261002',mainHead='20260823090000';
const cli=fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js',import.meta.url));
const sql=query=>execFileSync('docker',['exec',container,'psql','-U','postgres','-d','postgres','-Atc',query],{encoding:'utf8'}).trim();
function authorize(){const config=readFileSync(new URL('supabase/config.toml',stack),'utf8'),inspection=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];if(!config.includes(`project_id = "${project}"`)||!config.includes('port = 58421')||!config.includes('port = 58422')||inspection.Config.Labels['com.supabase.cli.project']!==project)throw new Error('BLOCKED: rehearsal target mismatch')}
function run(name,args){authorize();try{const output=execFileSync(process.execPath,[cli,...args,'--local','--workdir',workdir,'--yes'],{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});writeFileSync(new URL(`${name}.log`,evidenceDir),output)}catch{throw new Error(`${name} failed; review the private local log`)}console.log(name+' completed on verified synthetic local target')}
authorize();const before=sql('select max(version) from supabase_migrations.schema_migrations');
for(const name of readdirSync(new URL('../supabase/migrations/',import.meta.url)))if(name.endsWith('.sql'))copyFileSync(new URL('../supabase/migrations/'+name,import.meta.url),new URL('supabase/migrations/'+name,stack));
const expected=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(name=>/^\d+_.*\.sql$/.test(name)).sort().at(-1).split('_')[0];
run('main-reset',['db','reset','--version',mainHead]);if(sql('select max(version) from supabase_migrations.schema_migrations')!==mainHead)throw new Error('Main ledger mismatch');
run('candidate-upgrade',['db','push']);if(sql('select max(version) from supabase_migrations.schema_migrations')!==expected)throw new Error('Upgrade ledger mismatch');
run('candidate-clean-reset',['db','reset']);if(sql('select max(version) from supabase_migrations.schema_migrations')!==expected)throw new Error('Clean ledger mismatch');
// Same synthetic e2e-only fixture cleanup used by CI; it does not touch another stack.
sql("delete from auth.users where id in ('00000000-0000-0000-0000-000000000701'::uuid,'00000000-0000-0000-0000-000000000702'::uuid)");
const evidence={target:project,environment:'local synthetic',before,mainHead,migrationHead:expected,upgrade:'PASS',cleanRebuild:'PASS',postgres:sql('select version()'),extensions:JSON.parse(sql("select json_agg(json_build_object('name',extname,'version',extversion)) from pg_extension")),observedAt:new Date().toISOString(),cloudStaging:'BLOCKED',production:'NOT_RUN'};
writeFileSync(new URL('REHEARSAL.json',evidenceDir),JSON.stringify(evidence,null,2)+'\n');console.log('Main-to-candidate upgrade and clean local rebuild passed');
