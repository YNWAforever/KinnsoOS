import test from 'node:test';import assert from 'node:assert/strict';import * as navigation from '../lib/trips/draft-navigation.ts';
test('navigation accepts bounded locale app paths without accepting origins or executable URLs',()=>{
 assert.equal(navigation.safeAppDestination('/en/trips?after=abc'),'/en/trips?after=abc');assert.equal(navigation.safeAppDestination('/zh-HK/sign-up?next=%2Fzh-HK%2Ftrips'),'/zh-HK/sign-up?next=%2Fzh-HK%2Ftrips');
 for(const value of ['https://example.com/en','//example.com/en','javascript:alert(1)','/api/trips','/en/../../api/trips','/en\\evil','/en/%0a','/en/'+ 'x'.repeat(4096)])assert.equal(navigation.safeAppDestination(value),null,value);
});
