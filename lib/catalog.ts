/** Server-side catalog boundary. Public/published records only; never an identity adapter. */
import { backendTarget } from './contracts/capabilities.ts';
import { destinationAlias } from './catalog/destinations.ts';
export type CatalogItem = {
  id: string;
  slug: string;
  title: string;
  city: string;
  summary: string;
  cover: string | null;
  creator: string;
  creatorHandle: string;
  publishedAt: string | null;
};
export type CatalogQuery = {
  page: number;
  pageSize: 12;
  q: string;
  city: string;
};
export type CatalogResult =
  | {
      status: "ready";
      items: CatalogItem[];
      hasMore: boolean;
      query: CatalogQuery;
    }
  | { status: "unconfigured"; code: string }
  | { status: "error"; code: string };
type Environment = {
  KINNSO_SUPABASE_URL?: string;
  KINNSO_SUPABASE_PUBLISHABLE_KEY?: string;
  [key:string]:string|undefined;
};
const clean = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const raw = params.get("page") ?? "1";
  const page = /^[1-9]\d*$/.test(raw) ? Math.min(Number(raw), 100) : 1;
  return {
    page,
    pageSize: 12,
    q: clean(params.get("q"), 120),
    city: clean(params.get("city"), 80),
  };
}
export function safeCover(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "cdn.kinnso.ai" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function endpoint(env: Environment): { url: URL; key: string } | null {
  const approved = backendTarget(env);
  return approved ? {url:new URL('/rest/v1/guides',approved.origin),key:approved.key} : null;
}
function mapRow(value: unknown): CatalogItem {
  if (!value || typeof value !== "object") throw new Error("schema");
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    !r.id ||
    typeof r.slug !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(r.slug) ||
    typeof r.title !== "string" ||
    !r.title.trim() ||
    typeof r.city !== "string"
  )
    throw new Error("schema");
  return {
    id: r.id,
    slug: r.slug,
    title: r.title.slice(0, 200),
    city: r.city.slice(0, 100),
    summary: typeof r.summary === "string" ? r.summary.slice(0, 2000) : "",
    cover: safeCover(r.cover_url),
    creator: typeof r.creator_name === "string" ? r.creator_name : "",
    creatorHandle: typeof r.creator_handle === "string" ? r.creator_handle : "",
    publishedAt: typeof r.published_at === "string" ? r.published_at : null,
  };
}
export async function queryCatalog(
  input: Partial<CatalogQuery>,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<CatalogResult> {
  const target = endpoint(env);
  if (!target)
    return { status: "unconfigured", code: "catalog_not_configured" };
  const query = parseCatalogQuery(
    new URLSearchParams({
      page: String(input.page ?? 1),
      q: input.q ?? "",
      city: input.city ?? "",
    }),
  );
  const { url, key } = target;
  url.searchParams.set(
    "select",
    "id,slug,title,city,summary,cover_url,creator_handle,creator_name,published_at",
  );
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("order", "published_at.desc.nullslast,id.asc");
  url.searchParams.set("limit", String(query.pageSize + 1));
  url.searchParams.set("offset", String((query.page - 1) * query.pageSize));
  const destination=query.city ? null : destinationAlias(query.q);
  if (query.city) url.searchParams.set("city", "eq." + query.city);
  else if (destination) url.searchParams.set('city', destination==='Kyoto' ? 'in.(Kyoto,京都)' : 'in.("Hong Kong",香港)');
  if (query.q && !destination)
    url.searchParams.set(
      "or",
      `(title.ilike.*${query.q}*,city.ilike.*${query.q}*,summary.ilike.*${query.q}*)`,
    );
  try {
    const response = await transport(url, {
      headers: { apikey: key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) return { status: "error", code: "catalog_unavailable" };
    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length > 13)
      return { status: "error", code: "catalog_invalid_response" };
    const items = data.map(mapRow);
    return {
      status: "ready",
      items: items.slice(0, 12),
      hasMore: items.length > 12 && query.page < 100,
      query,
    };
  } catch {
    return { status: "error", code: "catalog_unavailable" };
  }
}
