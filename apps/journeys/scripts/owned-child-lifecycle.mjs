import {setTimeout,clearTimeout} from 'node:timers';

export function waitChild(child,{closeTimeoutMs=30000}={}){
 if(!Number.isSafeInteger(closeTimeoutMs)||closeTimeoutMs<=0||closeTimeoutMs>2147483647)
  throw new RangeError('OWNED_CHILD_CLOSE_TIMEOUT_INVALID');
 return new Promise((resolve,reject)=>{
  let stdout='',stderr='',exit=null,timer=null,settled=false,openStreams=0;
  const listeners=[];
  const listen=(target,event,handler,once=false)=>{
   target[once?'once':'on'](event,handler);
   listeners.push(()=>target.removeListener(event,handler));
  };
  const finish=(error)=>{
   if(settled)return;
   settled=true;clearTimeout(timer);
   for(const remove of listeners)remove();
   if(error)reject(error);else resolve({...exit,stdout,stderr});
  };
  const fail=(prefix,error)=>{
   const code=/^[A-Z0-9_]{1,40}$/.test(error?.code??'')?error.code:'UNCLASSIFIED';
   const safe=new Error(prefix+'_'+code);safe.code=safe.message;finish(safe);
  };
  const armDeadline=()=>{
   if(timer||settled)return;
   timer=setTimeout(()=>{
    const error=new Error('OWNED_CHILD_CLOSE_TIMEOUT');error.code=error.message;finish(error);
   },closeTimeoutMs);
  };
  // Manual IPC disconnect can omit ChildProcess.close even after exit and both pipes close.
  const complete=()=>{if(exit&&openStreams===0)finish()};
  listen(child,'error',error=>fail('OWNED_CHILD_SPAWN_FAILED',error),true);
  listen(child,'exit',(code,signal)=>{exit={code,signal};armDeadline();complete()},true);
  listen(child,'disconnect',armDeadline,true);
  for(const [name,stream] of [['stdout',child.stdout],['stderr',child.stderr]]){
   if(!stream)continue;
   listen(stream,'data',chunk=>{if(name==='stdout')stdout+=chunk;else stderr+=chunk});
   listen(stream,'error',error=>fail('OWNED_CHILD_STDIO_FAILED',error),true);
   if(!stream.closed){
    openStreams++;
    listen(stream,'close',()=>{openStreams--;complete()},true);
   }
  }
  if(child.exitCode!==null&&child.exitCode!==undefined||child.signalCode){
   exit={code:child.exitCode??null,signal:child.signalCode??null};armDeadline();complete();
  }
 });
}
