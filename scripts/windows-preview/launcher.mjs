import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {dirname,join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';

export function previewEnvironment(inherited,origin){
 const env=Object.fromEntries(Object.entries(inherited).filter(([key])=>!key.toUpperCase().startsWith('KINNSO_')));
 return{...env,KINNSO_SUPABASE_URL:'',KINNSO_SUPABASE_PUBLISHABLE_KEY:'',KINNSO_SUPABASE_SECRET_KEY:'',KINNSO_APPROVED_SUPABASE_ORIGIN:'',KINNSO_LEGACY_AUTH_ORIGIN:'',KINNSO_ENABLED_CAPABILITIES:'',KINNSO_SITE_URL:origin,KINNSO_ENVIRONMENT:'local',KINNSO_SYNTHETIC_RUN:'true',NEXT_TELEMETRY_DISABLED:'1'};
}

export async function findFreePort(candidates){
 for(const port of candidates){
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid preview port.');
  const available=await new Promise(resolvePort=>{
   const server=createServer();server.once('error',()=>resolvePort(null));
   server.listen(port,'127.0.0.1',()=>{const selected=server.address().port;server.close(()=>resolvePort(selected));});
  });
  if(available!==null)return available;
 }
 throw Error('No preview port is available. Close a previous preview and try again.');
}

export async function waitForInterface(url,{timeoutMs=180000,intervalMs=1000,isAlive=()=>true}={}){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  if(!isAlive())throw Error('The app stopped before its interface was ready. Read the server error above.');
  try{
   const response=await globalThis.fetch(url,{signal:globalThis.AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))});
   const html=await response.text();
   if(response.ok&&html.includes('id="studio-question"')&&html.includes('data-audience="traveller"'))return;
  }catch{/* The first compilation may still be in progress. */}
  await delay(intervalMs);
 }
 throw Error('The Kinnso interface did not become ready. Keep this window open and read the server messages above.');
}

function options(args){
 const value={noOpen:false,check:false,port:null};
 for(const arg of args){
  if(arg==='--no-open')value.noOpen=true;
  else if(arg==='--check')value.check=true;
  else if(/^--port=\d+$/.test(arg)){
   value.port=Number(arg.slice(7));if(value.port<1||value.port>65535)throw Error('Port must be between 1 and 65535.');
  }else throw Error('Unknown launcher option. Supported: --check, --no-open, --port=8772.');
 }
 return value;
}

function verifyApp(app){
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major<22||major===22&&minor<13)throw Error('Install Node.js 24 LTS (or Node.js 22.13 or newer), then double-click Start-Kinnso.cmd again.');
 for(const name of ['package.json','package-lock.json','SOURCE_METADATA.json','app/workroom/TripDraftHandoff.tsx']){
  if(!existsSync(join(app,name)))throw Error('The app files are missing. Extract the entire ZIP before running Start-Kinnso.cmd.');
 }
 for(const name of ['.env','.env.local','.env.development','.env.development.local']){
  if(existsSync(join(app,name)))throw Error('This preview folder contains an environment file. Use a fresh extracted copy to run the credential-free preview.');
 }
}

async function install(app,env,marker){
 const fingerprint=createHash('sha256').update(readFileSync(join(app,'package-lock.json'))).update(readFileSync(join(app,'package.json'))).digest('hex');
 if(existsSync(join(app,'node_modules/next/dist/bin/next'))&&existsSync(marker)&&readFileSync(marker,'utf8').trim()===fingerprint)return;
 console.log('Installing the pinned app dependencies. Internet access is needed on the first run.');
 const command=process.platform==='win32'?(process.env.ComSpec||'cmd.exe'):'npm';
 const args=process.platform==='win32'?['/d','/s','/c','npm.cmd ci']:['ci'];
 await new Promise((resolveInstall,reject)=>{
  const child=spawn(command,args,{cwd:app,env,stdio:'inherit'});
  child.once('error',reject);child.once('exit',code=>code===0?resolveInstall():reject(Error('Dependency installation failed. Check the npm message above, then run Start-Kinnso.cmd again.')));
 });
 writeFileSync(marker,fingerprint+'\n');
}

function openBrowser(url){
 if(process.platform!=='win32')return;
 // The URL is built only from a loopback address, validated numeric port and /en.
 // Match Node's cmd.exe shell quoting; CRT backslash escaping is not cmd syntax.
 const opener=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`"start "" "${url}""`],{stdio:'ignore',windowsHide:true,windowsVerbatimArguments:true});
 opener.once('error',()=>console.log('Open the local address shown above in your browser.'));
 opener.unref();
}

async function stopAppTree(child){
 if(!child.pid)return;
 if(process.platform!=='win32'){child.kill('SIGTERM');return;}
 // Next's CLI forks a server worker. Windows SIGTERM would kill only the CLI.
 await new Promise(resolveStop=>{
  const killer=spawn(join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
  const finish=code=>{
   if(code!==0&&child.exitCode===null&&child.signalCode===null)console.error('Could not stop the preview process tree. Close this terminal window before trying again.');
   resolveStop();
  };
  killer.once('error',()=>finish(1));killer.once('exit',finish);
 });
}

export async function main(args=process.argv.slice(2)){
 const opts=options(args),folder=dirname(fileURLToPath(import.meta.url)),app=join(folder,'app');
 verifyApp(app);
 if(opts.check){console.log('Preview source and Node.js checks passed.');return;}
 const port=await findFreePort(opts.port===null?[8772,3000,8773,8774,0]:[opts.port]);
 const origin=`http://127.0.0.1:${port}`,url=origin+'/en',env=previewEnvironment(process.env,origin);
 await install(app,env,join(folder,'.preview-install-lock'));
 console.log('Starting Kinnso on this computer. Account services are disabled for this preview.');
 const child=spawn(process.execPath,[join(app,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:app,env,stdio:'inherit'});
 let ended=false,stopping=false,termination;
 const finished=new Promise(resolveFinished=>{
  child.once('error',error=>{ended=true;resolveFinished({error});});
  child.once('exit',(code,signal)=>{ended=true;resolveFinished({code,signal});});
 });
 const stop=()=>{stopping=true;if(!ended)termination??=stopAppTree(child);};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  await waitForInterface(url,{isAlive:()=>!ended});
  console.log(`\nKinnso is ready on THIS computer: ${url}\nKeep this window open. Press Ctrl+C to stop.\n`);
  if(!opts.noOpen)openBrowser(url);
  const result=await finished;
  if(result.error)throw result.error;
  if(!stopping&&result.code!==0)throw Error('The app stopped. Read the server error above.');
 }catch(error){if(!stopping)throw error;}
 finally{
  process.off('SIGINT',stop);process.off('SIGTERM',stop);
  if(!ended)termination??=stopAppTree(child);
  if(termination)await termination;
  if(!ended){await Promise.race([finished,delay(5000)]);if(!ended)child.kill('SIGKILL');}
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error('\nKinnso could not start: '+error.message);process.exitCode=1;});
}
