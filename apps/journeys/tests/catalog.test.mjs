import { test } from "node:test";
import assert from "node:assert/strict";
import { queryCatalog, parseCatalogQuery, safeCover } from "../lib/catalog.ts";
const env = {
  KINNSO_SUPABASE_URL: "https://example.supabase.co",
  KINNSO_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  KINNSO_APPROVED_SUPABASE_ORIGIN: "https://example.supabase.co",
  KINNSO_LEGACY_AUTH_ORIGIN: "https://example.supabase.co",
};
test('a URL/key without explicit shared identity approval never enables catalog reads',async()=>{let called=false;const result=await queryCatalog({},{KINNSO_SUPABASE_URL:env.KINNSO_SUPABASE_URL,KINNSO_SUPABASE_PUBLISHABLE_KEY:env.KINNSO_SUPABASE_PUBLISHABLE_KEY},async()=>{called=true;return Response.json([])});assert.equal(result.status,'unconfigured');assert.equal(called,false)});
const row = {
  id: "guide-1",
  slug: "quiet-kyoto",
  title: "Quiet Kyoto",
  city: "Kyoto",
  summary: "A quiet weekend.",
  cover_url: null,
  creator_handle: "mika",
  creator_name: "Mika",
  published_at: "2026-08-23T00:00:00Z",
};
test("missing configuration is not successful empty data", async () =>
  assert.equal((await queryCatalog({}, {})).status, "unconfigured"));
test("bounded page and literal safe search", () => {
  const q = parseCatalogQuery(
    new URLSearchParams("page=999999&q=Kyoto%2Cstatus.eq.draft&city=Kyoto"),
  );
  assert.deepEqual(q, {
    page: 100,
    q: "Kyoto status eq draft",
    city: "Kyoto",
    pageSize: 12,
  });
});
test("invalid page values normalize without NaN or offsets", () => {
  for (const page of ["NaN", "-1", "1.5", "Infinity", ""])
    assert.equal(parseCatalogQuery(new URLSearchParams({ page })).page, 1);
});
test("successful response maps published summaries without invented stops", async () => {
  let url;
  const result = await queryCatalog({ page: 1 }, env, async (input) => {
    url = new URL(input);
    return Response.json([row]);
  });
  assert.equal(result.status, "ready");
  assert.equal(result.items[0].title, "Quiet Kyoto");
  assert.equal("days" in result.items[0], false);
  assert.equal(url.searchParams.get("status"), "eq.published");
  assert.equal(url.searchParams.get("limit"), "13");
  assert.equal(
    url.searchParams.get("order"),
    "published_at.desc.nullslast,id.asc",
  );
});
test("lookahead controls next page and only twelve items are returned", async () => {
  const r = await queryCatalog({ page: 2 }, env, async (url) => {
    assert.equal(new URL(url).searchParams.get("offset"), "12");
    return Response.json(
      Array.from({ length: 13 }, (_, i) => ({
        ...row,
        id: String(i),
        slug: "guide-" + i,
      })),
    );
  });
  assert.equal(r.status, "ready");
  assert.equal(r.items.length, 12);
  assert.equal(r.hasMore, true);
});
test("upstream failures remain errors rather than zero rows", async () => {
  for (const status of [401, 403, 429, 500]) {
    const r = await queryCatalog(
      {},
      env,
      async () => new Response("", { status }),
    );
    assert.equal(r.status, "error");
    assert.equal("items" in r, false);
  }
});
test("malformed records fail closed", async () => {
  const r = await queryCatalog({}, env, async () =>
    Response.json([{ ...row, slug: "../admin" }]),
  );
  assert.equal(r.status, "error");
});
test("empty successful catalog is distinct from failure", async () => {
  const r = await queryCatalog({}, env, async () => Response.json([]));
  assert.equal(r.status, "ready");
  assert.deepEqual(r.items, []);
});
test("timeout or network failure is recoverable", async () =>
  assert.equal(
    (
      await queryCatalog({}, env, async () => {
        throw new Error("timeout");
      })
    ).status,
    "error",
  ));
test("privileged keys and non-HTTPS endpoints never send requests", async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return Response.json([]);
  };
  for (const key of [
    "sb_secret_test",
    "eyJhbGciOiJIUzI1NiJ9." +
      Buffer.from(JSON.stringify({ role: "service_role" })).toString(
        "base64url",
      ) +
      ".sig",
  ]) {
    assert.equal(
      (
        await queryCatalog(
          {},
          { ...env, KINNSO_SUPABASE_PUBLISHABLE_KEY: key },
          transport,
        )
      ).status,
      "unconfigured",
    );
  }
  assert.equal(
    (
      await queryCatalog(
        {},
        { ...env, KINNSO_SUPABASE_URL: "http://example.supabase.co" },
        transport,
      )
    ).status,
    "unconfigured",
  );
  assert.equal(calls, 0);
});
test("only approved HTTPS image host passes cover validation", () => {
  assert.equal(
    safeCover("https://cdn.kinnso.ai/a.jpg"),
    "https://cdn.kinnso.ai/a.jpg",
  );
  for (const value of [
    "javascript:alert(1)",
    "https://evil.example/pixel",
    "http://cdn.kinnso.ai/a.jpg",
    "https://user:pass@cdn.kinnso.ai/a.jpg",
  ])
    assert.equal(safeCover(value), null);
});
test("search filter cannot alter published status or include PostgREST syntax", async () => {
  const result=await queryCatalog(
    { q: "東京,(status.eq.draft)", city: "Hong Kong", page: 1 },
    env,
    async (input) => {
      const url = new URL(input);
      assert.equal(url.searchParams.get("status"), "eq.published");
      assert.equal(url.searchParams.get("city"), "eq.Hong Kong");
      assert.equal(
        url.searchParams.get("or"),
        "(title.ilike.*東京 status eq draft*,city.ilike.*東京 status eq draft*,summary.ilike.*東京 status eq draft*)",
      );
      return Response.json([]);
    },
  );
  assert.equal(result.status,"ready");
});
