import { parseCatalogQuery, queryCatalog } from "../../../lib/catalog";
export async function GET(request: Request) {
  const result = await queryCatalog(
    parseCatalogQuery(new URL(request.url).searchParams),
    {
      KINNSO_SUPABASE_URL: process.env.KINNSO_SUPABASE_URL,
      KINNSO_SUPABASE_PUBLISHABLE_KEY:
        process.env.KINNSO_SUPABASE_PUBLISHABLE_KEY,
    },
  );
  return Response.json(result, {
    status: result.status === "ready" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
