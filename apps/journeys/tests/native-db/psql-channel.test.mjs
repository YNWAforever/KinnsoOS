import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createPsqlChannel} from './psql-channel.mjs';

function fakeChild(handle){
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kills=0;
  child.kill=()=>{child.kills++;queueMicrotask(()=>child.emit('close',1));};
  child.stdin=new Writable({
    write(chunk,encoding,done){if(chunk.toString()!=='\\q\n')handle(chunk.toString(),child);done();},
    final(done){queueMicrotask(()=>child.emit('close',0));done();}
  });
  return child;
}
const marker=text=>text.match(/\\echo ([A-Za-z0-9_]+):/)[1];
test('persistent psql frames split packets, binds results to their request and detects SQLSTATE',async()=>{
  const child=fakeChild((text,c)=>{
    const m=marker(text);
    c.stdout.write('{"answer":');
    c.stdout.write('42}\n'+m.slice(0,8));
    queueMicrotask(()=>c.stdout.write(m.slice(8)+': 00000\n'));
  });
  const channel=createPsqlChannel(child);
  assert.deepEqual(await channel.query('select 42;'),{rows:['{"answer":42}'],sqlState:'00000'});
  await channel.close();assert.equal(child.kills,0);
});
test('a concurrent query cannot reuse a busy connection',async()=>{
  const child=fakeChild(()=>{}),channel=createPsqlChannel(child,{timeoutMs:30});
  const first=channel.query('select 1;');
  await assert.rejects(channel.query('select 2;'),{code:'SQL_CONNECTION_BUSY'});
  await assert.rejects(first,{code:'SQL_STATEMENT_TIMEOUT'});
  assert.equal(child.kills,1);
});
test('SQL error and unexpected process exit fail with a sanitized state',async()=>{
  const child=fakeChild((text,c)=>{c.stderr.write('ERROR:  42P01: synthetic\n');c.stdout.write(marker(text)+': 42P01\n');});
  const channel=createPsqlChannel(child);
  await assert.rejects(channel.query('select missing;'),e=>e.code==='SQL_STATEMENT_FAILED'&&e.sqlState==='42P01');
  child.emit('close',1);
  await assert.rejects(channel.query('select 1;'),{code:'SQL_CONNECTION_CLOSED'});
});
test('transport death is unknown, output limits terminate and SQL meta commands are forbidden',async()=>{
  const child=fakeChild((text,c)=>c.emit('close',1)),channel=createPsqlChannel(child);
  await assert.rejects(channel.query('select 1;'),{code:'SQL_RESULT_UNKNOWN'});
  const large=fakeChild((text,c)=>c.stdout.write('x'.repeat(200))),bounded=createPsqlChannel(large,{maxBytes:100});
  await assert.rejects(bounded.query('select 1;'),{code:'SQL_OUTPUT_LIMIT'});
  assert.equal(large.kills,1);
  const idle=createPsqlChannel(fakeChild(()=>{}));
  await assert.rejects(idle.query('\\connect remote'),{code:'SQL_META_COMMAND_FORBIDDEN'});
  await idle.close();
});
