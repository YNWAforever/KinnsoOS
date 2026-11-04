import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer as tcpServer} from 'node:net';
import {createServer as httpServer} from 'node:http';
const path=new URL('../scripts/windows-preview/launcher.mjs',import.meta.url);
const launcher=existsSync(path)?await import(path):{};

test('the Windows preview cannot inherit account capability or backend credentials',()=>{
 assert.equal(typeof launcher.previewEnvironment,'function');
 const env=launcher.previewEnvironment({PATH:'fixture-path',HTTPS_PROXY:'http://proxy.invalid',KINNSO_SUPABASE_SECRET_KEY:'LIVE_SECRET',KINNSO_ENABLED_CAPABILITIES:'auth,trips',KINNSO_SUPABASE_URL:'https://live.invalid'},'http://127.0.0.1:8772');
 assert.equal(env.PATH,'fixture-path');assert.equal(env.HTTPS_PROXY,'http://proxy.invalid');
 assert.equal(env.KINNSO_ENABLED_CAPABILITIES,'');assert.equal(env.KINNSO_SUPABASE_URL,'');
 assert.equal(env.KINNSO_SITE_URL,'http://127.0.0.1:8772');assert.equal(env.KINNSO_ENVIRONMENT,'local');
 assert.ok(!JSON.stringify(env).includes('LIVE_SECRET'));assert.ok(!JSON.stringify(env).includes('https://live.invalid'));
});

test('an occupied port is skipped without touching the existing service',async()=>{
 assert.equal(typeof launcher.findFreePort,'function');
 const busy=tcpServer();await new Promise(resolve=>busy.listen(0,'127.0.0.1',resolve));
 try{
  const port=busy.address().port,chosen=await launcher.findFreePort([port,0]);
  assert.notEqual(chosen,port);assert.ok(chosen>0);
  assert.equal(busy.listening,true);
 }finally{await new Promise(resolve=>busy.close(resolve));}
});

test('browser readiness waits for the Kinnso interface rather than any HTTP 200',async()=>{
 assert.equal(typeof launcher.waitForInterface,'function');
 let hits=0;
 const server=httpServer((_request,response)=>{hits++;response.end(hits===1?'Another application':'<textarea id="studio-question"></textarea><article data-audience="traveller"></article>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await launcher.waitForInterface(`http://127.0.0.1:${server.address().port}/en`,{timeoutMs:3000,intervalMs:10});
  assert.equal(hits,2);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('a server that never renders the app cannot be reported ready',async()=>{
 assert.equal(typeof launcher.waitForInterface,'function');
 const server=httpServer((_request,response)=>response.end('Nothing to see here'));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await assert.rejects(launcher.waitForInterface(`http://127.0.0.1:${server.address().port}/`,{timeoutMs:120,intervalMs:10}),/interface/i);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
