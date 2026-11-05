// Produces review artifacts only; never connects to a database or deploys.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertTransactionalSql} from './migration-release.mjs';
const root=new URL('../',import.meta.url);
const name='20261104195741_active_merchant_mission_writes.sql';
const source=readFileSync(new URL('supabase/migrations/'+name,root),'utf8');
const sha=text=>createHash('sha256').update(text).digest('hex');
const first=source.match(/^begin;\r?$/m);
if(!first||!source.trimEnd().endsWith('commit;'))throw Error('UNEXPECTED_TRANSACTION_WRAPPER');
const payload=source.slice(0,first.index)+source.slice(first.index+first[0].length).replace(/commit;\s*$/,'');
assertTransactionalSql(payload);
const output=new URL('.local-private/suspension-release-package/',root);
mkdirSync(output,{recursive:true});
writeFileSync(new URL('payload.sql',output),payload);
writeFileSync(new URL('manifest.json',output),JSON.stringify({
 sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 source:name,sourceSha256:sha(source),payloadSha256:sha(payload),
 transformation:'Remove only the outer BEGIN and final COMMIT; deployment executor supplies its guarded transaction.',
 status:'PREPARED_NOT_AUTHORIZED',productionChanged:false,
 remaining:['fresh consistent production export and restore','catalog-bound failure/commit rehearsal','exact execution envelope and human approval'],
},null,2)+'\n');
console.log(JSON.stringify({sourceSha256:sha(source),payloadSha256:sha(payload),status:'PREPARED_NOT_AUTHORIZED'}));
