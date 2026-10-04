import test from 'node:test';
import assert from 'node:assert/strict';
import {callbackOrigin} from '../lib/auth/callback-origin.ts';
test('callback redirects use the configured production origin behind a local hosting proxy',()=>{
 assert.equal(callbackOrigin({KINNSO_SITE_URL:'https://kinnso-os.vercel.app'}),'https://kinnso-os.vercel.app');
 assert.equal(callbackOrigin({KINNSO_SITE_URL:'http://127.0.0.1:3495',KINNSO_ENVIRONMENT:'local'}),'http://127.0.0.1:3495');
});
test('callback origin rejects missing configuration, credentials, paths and insecure nonlocal hosts',()=>{
 for(const KINNSO_SITE_URL of ['', 'https://user:pass@example.test','https://example.test/path','https://example.test/?next=x','https://example.test/#hash','http://example.test','http://127.0.0.1:3495'])assert.equal(callbackOrigin({KINNSO_SITE_URL}),null);
});
