// Importing this public source gate performs no I/O and loads no target or SDK.
import {accessSync,closeSync,constants,fstatSync,lstatSync,openSync,readSync,statSync} from 'node:fs';
import {Buffer} from 'node:buffer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot=fileURLToPath(new URL('../',import.meta.url));
const commonInputs=[
 'scripts/real-suite-source.mjs',
 'scripts/real-integration-runner.mjs',
 'tests/real-integration/fixture.mjs',
 'tests/real-integration/target.mjs',
 'tests/real-integration/result-summary.mjs',
 'tests/real-integration/target-catalog.sql',
];
const original=['playwright.real-integration.config.ts','tests/real-integration/journey.spec.ts'];
const selections=new Map([
 ['FULL_EXISTING_8',[8,...original]],['TRAVELLER_CORE_12',[12,...original]],
 ['en/desktop',[3,...original]],['en/mobile',[3,...original]],
 ['zh-HK/desktop',[3,...original]],['zh-HK/mobile',[3,...original]],
 ['en/',[6,...original]],['zh-HK/',[6,...original]],
 ['TODAY_SLICE_4',[4,'playwright.today-slice.config.ts','tests/real-integration/today-slice.spec.ts']],
 ['STALE_TAB_4',[4,'playwright.stale-tab.config.ts','tests/real-integration/stale-tab.spec.ts']],
]);

export class SourceInputBlocked extends Error {
 constructor(code,suite,missingInputs){
  super(code);this.name='SourceInputBlocked';this.code=code;
  if(suite){this.testSelection=suite.testSelection;this.expectedCaseCount=suite.expectedCaseCount}
  if(missingInputs)this.missingInputs=missingInputs;
 }
}

export function realSuiteSourceInputs(testSelection='FULL_EXISTING_8'){
 const selected=selections.get(testSelection);
 if(!selected)throw new SourceInputBlocked('UNAPPROVED_TEST_SELECTION');
 const [expectedCaseCount,config,spec]=selected;
 return {testSelection,expectedCaseCount,config,requiredInputs:[...commonInputs,config,spec]};
}

// The caller supplies the existing approval-file pointer. No discovery, dotenv,
// alternate location, or private bootstrap reads are permitted here.
export function readRealSuiteApproval(env={}){
 const location=env.KINNSO_REAL_IT_APPROVAL_FILE;
 if(location===undefined||location==='')return null;
 const maximum=128*1024;
 let fd,approval;
 try{
  if(typeof location!=='string')throw new Error();
  fd=openSync(location,'r');
  const info=fstatSync(fd);
  if(!info.isFile()||info.size>maximum)throw new Error();
  // One sentinel byte also bounds reads if the file grows after fstat.
  const buffer=Buffer.alloc(maximum+1);
  let length=0;
  while(length<buffer.length){
   const count=readSync(fd,buffer,length,buffer.length-length,null);
   if(count===0)break;
   length+=count;
  }
  if(length>maximum)throw new Error();
  approval=JSON.parse(buffer.subarray(0,length).toString('utf8'));
 }catch{
  throw new SourceInputBlocked('APPROVAL_RECORD_UNREADABLE');
 }finally{
  if(fd!==undefined)closeSync(fd);
 }
 if(!approval||typeof approval!=='object'||Array.isArray(approval)||approval.approved!==true)
  throw new SourceInputBlocked('APPROVAL_REQUIRED');
 realSuiteSourceInputs(approval.testSelection);
 return approval;
}

export function assertRealSuiteSource({appRoot:location=appRoot,testSelection}={}){
 const suite=realSuiteSourceInputs(testSelection);
 const repository=path.resolve(location,'../..');
 // Do not inspect parent repository markers once extraction is known.
 let extracted=true;
 try{lstatSync(path.join(location,'SOURCE_METADATA.json'))}catch(error){if(error.code==='ENOENT')extracted=false}
 if(extracted)throw new SourceInputBlocked('FULL_REPOSITORY_REQUIRED',suite);
 let fullRepository=false;
 try{
  const marker=statSync(path.join(repository,'.git'));
  fullRepository=path.basename(location)==='journeys'&&
   path.basename(path.dirname(location))==='apps'&&(marker.isFile()||marker.isDirectory())&&
   statSync(path.join(repository,'supabase/migrations')).isDirectory();
 }catch{fullRepository=false}
 // Layout is only a prerequisite. verifyTarget still binds Git identity, the
 // complete migration manifest, approval, private bootstrap and live target.
 if(!fullRepository)throw new SourceInputBlocked('FULL_REPOSITORY_REQUIRED',suite);
 const missingInputs=suite.requiredInputs.filter(name=>{
  try{
   const candidate=path.join(location,name);
   if(!lstatSync(candidate).isFile())return true;
   accessSync(candidate,constants.R_OK);return false;
  }catch{return true}
 });
 if(missingInputs.length)throw new SourceInputBlocked('MISSING_SOURCE_INPUTS',suite,missingInputs);
 return suite;
}
