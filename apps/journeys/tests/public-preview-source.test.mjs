import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {repositoryInputUrl} from './packaged-source.mjs';

test('public destination preview source is loopback-only and explicitly fixture evidence',async()=>{
 const source=await readFile(new URL('../scripts/check-public-destination-preview.mjs',import.meta.url),'utf8');
 assert.match(source,/127\.0\.0\.1/);
 assert.match(source,/KINNSO_SUPABASE_URL/);
 assert.match(source,/KINNSO_SUPABASE_PUBLISHABLE_KEY/);
 assert.match(source,/KINNSO_SYNTHETIC_RUN\s*:\s*'true'/);
 assert.match(source,/for\(const key of \['KINNSO_SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'\]\)delete env\[key\]/);
 assert.doesNotMatch(source,/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(source,/LOCAL_FIXTURE_UI_ONLY/);
 assert.match(source,/javaScriptEnabled/);
 assert.match(source,/width:\s*390/);
 assert.match(source,/width:\s*1280/);
 assert.match(source,/axe/);
 assert.match(source,/\.local-private\/single-origin\/destinations-preview/);
 assert.match(source,/assert\.equal\(new URL\([^)]+\)\.hostname,'127\.0\.0\.1'\)/s);
});

test('article fixture browser rejects unverified author-to-creator links',async()=>{
 const source=await readFile(repositoryInputUrl('scripts/check-public-article-preview.mjs',import.meta.url),'utf8');
 assert.match(source,/authors:\['fixture-author'\]/);
 assert.match(source,/article_authors/);
 assert.match(source,/a\[href="\/\$\{locale\}\/c\/fixture-author"\]`\)\.count\(\),0/);
});
