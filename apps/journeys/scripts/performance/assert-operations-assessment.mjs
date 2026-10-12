import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {assessRun} from './report.mjs';

// A successful collector preserves slow measurements. Release acceptance is separate.
try {
 const [reportPath,expectedSource,candidate=expectedSource,base='']=process.argv.slice(2);
 const sha=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
 const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
 requireValue(reportPath&&sha(expectedSource)&&sha(candidate)&&(!base||sha(base)),'Explicit report path and full source revisions are required');
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 requireValue(git('rev-parse','HEAD')===expectedSource,'Checkout does not match expected measured source');
 requireValue(git('status','--porcelain','--untracked-files=normal')==='','Source checkout is dirty');
 const sourceTree=git('rev-parse',expectedSource+'^{tree}');
 requireValue(sourceTree===git('rev-parse',candidate+'^{tree}'),'Measured tree does not match candidate tree');
 if(candidate!==expectedSource){
  requireValue(sha(base),'PR source mapping requires the exact base revision');
  const parents=git('show','-s','--format=%P',expectedSource).split(' ');
  requireValue(parents.length===2&&parents[0]===base&&parents[1]===candidate,'PR source parents do not match the declared base and head');
 }
 const report=JSON.parse(readFileSync(reportPath,'utf8'));
 requireValue(report.kind==='operations'&&report.sourceSha===expectedSource,'Report is not for the expected operations source');
 const conditions=report.conditions,screen=conditions?.screenEmulation,throttle=conditions?.throttling,dataset=report.dataset;
 requireValue(conditions?.formFactor==='mobile'&&conditions?.throttlingMethod==='devtools'&&screen?.mobile===true&&screen?.width===390&&screen?.height===844&&screen?.deviceScaleFactor===1&&screen?.disabled===false&&throttle?.requestLatencyMs===150&&throttle?.downloadThroughputKbps===1600&&throttle?.uploadThroughputKbps===750&&throttle?.cpuSlowdownMultiplier===4,'Required mobile measurement conditions are missing or changed');
 requireValue(dataset?.campaigns>=55&&dataset?.acceptedCreatorWork>=55&&dataset?.reviewSubmissions>=1&&['creator','merchant_owner'].every(role=>dataset?.roles?.includes(role)),'Owned operations dataset is incomplete');
 requireValue(Array.isArray(report.sourceDiff)&&report.sourceDiff.length===0,'Measured source was dirty or unverified');
 requireValue(report.samples?.length===48&&report.interactions?.length===8&&report.queryLatency?.samples?.length===24,'Complete 48 navigation, 8 interaction and 24 read samples are required');
 requireValue(report.assessment?.status==='PASS','Recorded assessment is not PASS');
 const assessment=assessRun(report);
 requireValue(assessment.status==='PASS','Recomputed assessment is not PASS');
 requireValue(new Set(report.interactions.map(item=>item.page)).size===8,'Interactions contain duplicate or unknown pages');
 console.log(JSON.stringify({status:'PASS',sourceSha:expectedSource,sourceTree,candidateHead:candidate,baseSha:base||null,scope:'Owned local operations release prerequisite; hosted acceptance is separate',navigation:48,interactions:8,reads:24}));
} catch(error) {
 console.error('Operations release gate rejected: '+error.message);
 process.exitCode=1;
}
