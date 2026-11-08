/** Connected search, pagination and back links stay on /explore. Demo sample routes already own that path, so the demo catalog stays on /library. */
export function catalogResultsPath(pathname: string): "explore" | "library" {
  return pathname.split("/").includes("demo") ? "library" : "explore";
}

/** Old /library URLs keep their query and replace history with the canonical results page. */
export function connectedCatalogRedirect(
  locale: string,
  path: string,
  demo: boolean,
  search: Record<string, string | string[] | undefined> | undefined,
): string | null {
  if (demo || path !== "library" || (locale !== "en" && locale !== "zh-HK")) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  const query = params.toString();
  return `/${locale}/explore${query ? `?${query}` : ""}`;
}
