import { parseCatalogQuery, queryCatalog } from "../../../lib/catalog";
export async function GET(request: Request) {
  const result = await queryCatalog(
    parseCatalogQuery(new URL(request.url).searchParams),
    process.env,
  );
  return Response.json(result, {
    status: result.status === "ready" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
