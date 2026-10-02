import { test } from 'node:test';
import assert from 'node:assert/strict';
const contract = await import('../lib/api/validation.ts').catch(() => ({}));
test('writes require the exact application origin and a bounded command envelope', () => {
  assert.equal(typeof contract.sameOrigin, 'function');
  assert.equal(contract.sameOrigin(new Request('https://journeys.test/api/trips', { method:'POST', headers:{ origin:'https://journeys.test' } })), true);
  for (const origin of [undefined, 'null', 'https://evil.test', 'https://journeys.test.evil.test']) {
    assert.equal(contract.sameOrigin(new Request('https://journeys.test/api/trips', {method:'POST',headers:origin ? {origin} : {}})), false);
  }
  const valid = { requestId:'cc08a943-52fc-44e8-9310-e0965d7d0fcb', expectedRevision:1, command:{type:'addDay',id:'cc08a943-52fc-44e8-9310-e0965d7d0fca',offset:0,title:'Day'} };
  assert.deepEqual(contract.commandEnvelope(valid), valid);
  const local=new Request('http://localhost:3491/api/trips',{method:'POST',headers:{origin:'http://127.0.0.1:3491',host:'127.0.0.1:3491'}});
  assert.equal(contract.sameOrigin(local,'http://127.0.0.1:3491'),true);
  assert.equal(contract.sameOrigin(local,'http://evil.test'),false);
  for (const value of [{...valid, expectedRevision:0}, {...valid, ownerId:'forged'}, {...valid, command:{type:'promoteRole'}}]) assert.throws(() => contract.commandEnvelope(value));
});
