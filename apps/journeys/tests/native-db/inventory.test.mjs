import test from 'node:test';
import assert from 'node:assert/strict';
import {cliEnvironment,parseCliVersion} from './inventory.mjs';
test('CLI metadata probes disable telemetry and exclude inherited provider credentials',()=>{const e=cliEnvironment({PATH:'cached',SystemRoot:'C:/Windows',SUPABASE_ACCESS_TOKEN:'secret',DATABASE_URL:'secret',SUPABASE_CLI_BINARY_OVERRIDE:'remote',HOME:'do-not-repurpose'});assert.equal(e.SUPABASE_TELEMETRY_DISABLED,'1');assert.equal(e.DO_NOT_TRACK,'1');assert.equal(e.PATH,'cached');for(const k of ['SUPABASE_ACCESS_TOKEN','DATABASE_URL','SUPABASE_CLI_BINARY_OVERRIDE','HOME'])assert.equal(k in e,false);});
test('only exact successful executable version output is accepted',()=>{assert.equal(parseCliVersion({exitCode:0,stdout:'2.107.0\n'}),'2.107.0');for(const r of [{exitCode:1,stdout:'2.107.0'},{exitCode:0,stdout:'2.108.0'},{exitCode:0,stdout:'error\n2.107.0'}])assert.equal(parseCliVersion(r),null);});
