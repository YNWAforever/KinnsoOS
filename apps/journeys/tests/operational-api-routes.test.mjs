import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

const routes=[
 ['../app/api/admin/analytics/route.ts','GET'],
 ['../app/api/analytics/route.ts','POST'],
 ['../app/api/cron/traveller-analytics-retention/route.ts','GET'],
 ['../app/api/health/route.ts','GET'],
 ['../app/api/revalidate/route.ts','POST'],
];

test('all legacy operational APIs have an explicit native owner and method',async()=>{
 for(const [relative,method] of routes){
  const path=new URL(relative,import.meta.url);
  assert.ok(existsSync(path),relative);
  const source=await readFile(path,'utf8');
  assert.match(source,new RegExp(`export async function ${method}\\(`),relative);
 }
});
