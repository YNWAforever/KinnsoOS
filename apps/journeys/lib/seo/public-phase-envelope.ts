export type PublicPhaseEnvelope = {
  schemaVersion: number;
  status: string;
  codeHead: string;
  project: string;
  finalTarget: {name:string;productionChanged:boolean};
  routes: {legacyPath:string;nativePath:string;disposition:string;evidenceKinds:string[]}[];
  locales: string[];
  browser: {viewports:number[];javaScript:boolean[];keyboard:boolean;accessibility:boolean;reflow:boolean};
  sessions: {present:boolean;absent:boolean;failure:boolean};
  security: {withdrawal:boolean;suspension:boolean;crossAccountIsolation:boolean;duplicateProtected:boolean};
  tests: {unit:string;typecheck:string;build:string;fixtureBrowser:string;connected:string};
  backupRestore: string;
  connectedResult?: {productHead:string;passed:number;expected:number};
};
class EnvelopeError extends Error{code:string;constructor(code:string){super(code);this.code=code}}
const fail=(code:string):never=>{throw new EnvelopeError(code)};
const expectedLocales=['en','zh-HK','zh-tw','zh-cn','ja','ko','th'];

export function validatePublicPhaseEnvelope(value:unknown){
 const envelope=value as PublicPhaseEnvelope;
 if(!envelope||envelope.schemaVersion!==1||envelope.status!=='READY_FOR_USER_REVIEW')fail('ENVELOPE_SCHEMA');
 if(!/^[a-f0-9]{40}$/.test(envelope.codeHead??'')||/^0{40}$/.test(envelope.codeHead)||!/^kinnsoos-public-it-/.test(envelope.project??''))fail('ENVELOPE_IDENTITY');
 if(envelope.finalTarget?.name!=='kinnso-os.vercel.app'||envelope.finalTarget.productionChanged!==false)fail('TARGET_BOUNDARY');
 if(envelope.backupRestore!=='WAIVED')fail('BACKUP_BOUNDARY');
 if(JSON.stringify([...(envelope.locales??[])].sort())!==JSON.stringify([...expectedLocales].sort()))fail('LOCALE_COVERAGE');
 if(JSON.stringify(envelope.browser?.viewports)!==JSON.stringify([390,1280])||JSON.stringify(envelope.browser?.javaScript)!==JSON.stringify([false,true])||!envelope.browser.keyboard||!envelope.browser.accessibility||!envelope.browser.reflow)fail('BROWSER_COVERAGE');
 if(!envelope.sessions?.present||!envelope.sessions?.absent||!envelope.sessions?.failure)fail('SESSION_COVERAGE');
 if(!envelope.security?.withdrawal||!envelope.security?.suspension||!envelope.security?.crossAccountIsolation||!envelope.security?.duplicateProtected)fail('SECURITY_COVERAGE');
 if(envelope.tests?.unit!=='PASS'||envelope.tests?.typecheck!=='PASS'||envelope.tests?.build!=='PASS'||envelope.tests?.fixtureBrowser!=='PASS_28'||envelope.tests?.connected!=='PASS_8')fail('TEST_COVERAGE');
 if(!Array.isArray(envelope.routes)||!envelope.routes.length)fail('ROUTE_COVERAGE');
 for(const route of envelope.routes){
  if(route.disposition!=='accepted-public-read'||!route.legacyPath?.startsWith('/{locale}/')||!route.nativePath?.startsWith('/{locale}/')||!route.evidenceKinds?.includes('LOCAL_FIXTURE_UI_ONLY')||!route.evidenceKinds.includes('REAL_ISOLATED_TARGET'))fail('CONNECTED_EVIDENCE_REQUIRED');
 }
 if(envelope.connectedResult&&(envelope.connectedResult.productHead!==envelope.codeHead||envelope.connectedResult.passed!==8||envelope.connectedResult.expected!==8))fail('EVIDENCE_SHA_MISMATCH');
 return {status:'READY_FOR_USER_REVIEW',codeHead:envelope.codeHead,project:envelope.project,routes:envelope.routes.length};
}
