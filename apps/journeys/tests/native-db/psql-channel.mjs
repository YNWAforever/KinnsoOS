import {randomUUID} from 'node:crypto';
import {Blocked,gate} from './target.mjs';

export function createPsqlChannel(child,{timeoutMs=15000,maxBytes=1024*1024}={}){
  gate(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=15000&&Number.isSafeInteger(maxBytes)&&maxBytes>0,'SQL_CHANNEL_CONFIG_INVALID');
  let closed=false,pending=null;
  const exited=new Promise(resolve=>{child.once('close',resolve);child.once('error',resolve);});
  const stop=()=>{if(!closed){closed=true;child.kill();}};
  const reject=(code,sqlState)=>{
    if(!pending)return;
    const active=pending;pending=null;clearTimeout(active.timer);
    const error=new Blocked(code);if(sqlState)error.sqlState=sqlState;active.reject(error);
  };
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    if(!pending)return;
    pending.bytes+=Buffer.byteLength(chunk);
    if(pending.bytes>maxBytes){reject('SQL_OUTPUT_LIMIT');stop();return;}
    pending.buffer+=chunk;
    for(let newline;(newline=pending?.buffer.indexOf('\n')??-1)>=0;){
      const line=pending.buffer.slice(0,newline).replace(/\r$/,'');pending.buffer=pending.buffer.slice(newline+1);
      if(line.startsWith(pending.marker+': ')){
        const sqlState=line.slice(pending.marker.length+2);
        if(!/^[0-9A-Z]{5}$/.test(sqlState)){reject('SQL_PROTOCOL_INVALID');stop();return;}
        if(sqlState!=='00000'){reject('SQL_STATEMENT_FAILED',sqlState);return;}
        const active=pending;pending=null;clearTimeout(active.timer);
        active.resolve({rows:active.rows,sqlState});return;
      }
      if(line.length)pending.rows.push(line);
    }
  });
  child.stderr.on('data',chunk=>{
    if(!pending)return;
    pending.bytes+=Buffer.byteLength(chunk);
    if(pending.bytes>maxBytes){reject('SQL_OUTPUT_LIMIT');stop();}
  });
  const died=()=>{closed=true;reject('SQL_RESULT_UNKNOWN');};
  child.on('close',died);child.on('error',died);child.stdin.on('error',died);
  return Object.freeze({
    async query(sql){
      gate(!closed,'SQL_CONNECTION_CLOSED');gate(!pending,'SQL_CONNECTION_BUSY');
      gate(typeof sql==='string'&&!sql.includes('\0')&&!/^\s*\\/m.test(sql),'SQL_META_COMMAND_FORBIDDEN');
      return await new Promise((resolve,rejectQuery)=>{
        const marker='__na_'+randomUUID().replaceAll('-','');
        const timer=setTimeout(()=>{reject('SQL_STATEMENT_TIMEOUT');stop();},timeoutMs);
        pending={marker,resolve,reject:rejectQuery,timer,rows:[],buffer:'',bytes:0};
        child.stdin.write(sql+'\n\\echo '+marker+': :SQLSTATE\n');
      });
    },
    async close(){
      if(pending){reject('SQL_RESULT_UNKNOWN');stop();child.stdin.end();return;}
      if(closed)return;
      closed=true;
      // Let psql disconnect its backend before ending the Docker exec client.
      child.stdin.end('\\q\n');
      let timer;
      try{await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{child.kill();resolve();},1000);})]);}
      finally{clearTimeout(timer);}
    }
  });
}
