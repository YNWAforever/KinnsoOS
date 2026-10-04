import test from 'node:test';
import assert from 'node:assert/strict';
import {inventory} from '../scripts/check-url-parity.mjs';

const origin='https://remix-kinnso-web.vercel.app';
const sitemap=(path)=>`<urlset><url><loc>${origin}${path}</loc></url></urlset>`;
async function withResponses(responses,run) {
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async(url,options)=>{
    requested.push(url);
    assert.equal(options.redirect,'manual');
    const fixture=responses[url];
    assert.ok(fixture,`Unexpected request: ${url}`);
    return new Response(fixture.body??'',{status:fixture.status??200});
  };
  try{return await run(requested);}finally{globalThis.fetch=original;}
}

test('default discovery follows every same-origin robots sitemap when the flat sitemap is absent',async()=>{
  await withResponses({
    [origin+'/sitemap.xml']:{status:404},
    [origin+'/robots.txt']:{body:`User-agent: *\nSitemap: ${origin}/sitemap/0.xml\nsitemap: ${origin}/sitemap/1.xml # second shard\nSitemap: ${origin}/sitemap/0.xml\n`},
    [origin+'/sitemap/0.xml']:{body:sitemap('/en/g/authored')},
    [origin+'/sitemap/1.xml']:{body:sitemap('/zh-hk/g/authored')},
  },async(requested)=>{
    const result=await inventory();
    assert.deepEqual(result.urls,[origin+'/en/g/authored',origin+'/zh-hk/g/authored']);
    assert.deepEqual(result.shards,[origin+'/sitemap/0.xml',origin+'/sitemap/1.xml']);
    assert.equal(result.discovery.method,'robots');
    assert.equal(result.discovery.robotsSource,origin+'/robots.txt');
    assert.equal(requested.length,4);
  });
});

test('robots discovery rejects another origin before requesting its shard',async()=>{
  await withResponses({[origin+'/sitemap.xml']:{status:404},[origin+'/robots.txt']:{body:'Sitemap: https://www.kinnso.ai/sitemap.xml'}},async(requested)=>{
    await assert.rejects(inventory(),/Offsite or unsafe/);
    assert.equal(requested.length,2);
  });
});

test('an empty advertised sitemap cannot certify a URL inventory',async()=>{
  await withResponses({[origin+'/sitemap.xml']:{body:'<urlset></urlset>'}},async()=>{
    await assert.rejects(inventory(),/Empty sitemap inventory/);
  });
});

test('a failing flat sitemap is reported without masking it through robots fallback',async()=>{
  await withResponses({[origin+'/sitemap.xml']:{status:500}},async(requested)=>{
    await assert.rejects(inventory(),/Sitemap 500/);
    assert.deepEqual(requested,[origin+'/sitemap.xml']);
  });
});

test('an explicit sitemap keeps its exact scope and does not guess alternative sources',async()=>{
  await withResponses({[origin+'/sitemap/0.xml']:{body:sitemap('/en/g/authored')}},async()=>{
    const result=await inventory(origin+'/sitemap/0.xml');
    assert.equal(result.discovery.method,'explicit');
    assert.equal(result.discovery.robotsSource,null);
  });
});

test('a completed shard advertised directly and through an index is fetched once',async()=>{
  await withResponses({
    [origin+'/sitemap.xml']:{status:404},
    [origin+'/robots.txt']:{body:`Sitemap: ${origin}/index.xml\nSitemap: ${origin}/leaf.xml`},
    [origin+'/index.xml']:{body:`<sitemapindex><sitemap><loc>${origin}/leaf.xml</loc></sitemap></sitemapindex>`},
    [origin+'/leaf.xml']:{body:sitemap('/en/g/authored')},
  },async(requested)=>{
    const result=await inventory();
    assert.deepEqual(result.urls,[origin+'/en/g/authored']);
    assert.equal(requested.filter(url=>url===origin+'/leaf.xml').length,1);
  });
});

test('an active index cycle is rejected without fetching a shard repeatedly',async()=>{
  await withResponses({
    [origin+'/sitemap.xml']:{body:`<sitemapindex><sitemap><loc>${origin}/loop.xml</loc></sitemap></sitemapindex>`},
    [origin+'/loop.xml']:{body:`<sitemapindex><sitemap><loc>${origin}/sitemap.xml</loc></sitemap></sitemapindex>`},
  },async(requested)=>{
    await assert.rejects(inventory(),/cyclic sitemap/);
    assert.equal(requested.length,2);
  });
});
