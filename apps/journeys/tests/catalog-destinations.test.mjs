import {test} from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../lib/catalog/destinations.ts').catch(()=>({}));
test('destination aliases canonicalize only exact destination queries',()=>{
 assert.equal(typeof api.destinationAlias,'function');
 for(const q of ['京都','Kyoto',' KYOTO ']) assert.equal(api.destinationAlias(q),'Kyoto');
 for(const q of ['香港','Hong Kong']) assert.equal(api.destinationAlias(q),'Hong Kong');
 assert.equal(api.destinationAlias('coffee in Kyoto'),null);
});
