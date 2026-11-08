import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('FINAL default build selects supported webpack',()=>assert.match(JSON.parse(readFileSync('package.json')).scripts.build,/next build --webpack/));
