import { publicLanguage } from './public-language.ts';

export type PublicRoute =
  | { kind: 'destinations-index'; page: number }
  | { kind: 'destination'; slug: string }
  | { kind: 'guide'; reference: string }
  | { kind: 'creator'; handle: string; page: number }
  | { kind: 'experience'; slug: string }
  | { kind: 'merchant'; slug: string }
  | { kind: 'sessions-index' }
  | { kind: 'session'; slug: string };

const identifier = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]{0,199}$/u;
const handle = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;

function pageFrom(query: URLSearchParams): number | null {
  const values = query.getAll('page');
  if (values.length > 1) return null;
  if (!values.length) return 1;
  if (!/^[1-9][0-9]{0,4}$/.test(values[0]) || Number(values[0]) > 10_000) {
    return null;
  }
  return Number(values[0]);
}

export function parsePublicRoute(
  locale: string,
  route: readonly string[],
  query: URLSearchParams,
): PublicRoute | null {
  if (!publicLanguage(locale)) return null;
  const [head, value, extra] = route;
  if (extra !== undefined) return null;

  if (head === 'destinations' && value === undefined) {
    const page = pageFrom(query);
    return page === null ? null : { kind: 'destinations-index', page };
  }
  if (head === 'destinations' && value !== undefined) {
    return identifier.test(value) ? { kind: 'destination', slug: value } : null;
  }
  if (head === 'g' && value !== undefined) {
    return identifier.test(value) ? { kind: 'guide', reference: value } : null;
  }
  if (head === 'c' && value !== undefined) {
    const page = pageFrom(query);
    return page !== null && handle.test(value)
      ? { kind: 'creator', handle: value, page }
      : null;
  }
  if (head === 'experiences' && value !== undefined) {
    return identifier.test(value)
      ? { kind: 'experience', slug: value }
      : null;
  }
  if (head === 'm' && value !== undefined) {
    return identifier.test(value)
      ? { kind: 'merchant', slug: value }
      : null;
  }
  if (head === 'sessions' && value === undefined) {
    return { kind: 'sessions-index' };
  }
  if (head === 'sessions' && value !== undefined) {
    return identifier.test(value) ? { kind: 'session', slug: value } : null;
  }
  return null;
}

export function publicRouteHref(locale: string, route: PublicRoute): string {
  const language = publicLanguage(locale);
  if (!language) throw new Error('unsupported_public_language');
  const root = `/${language}`;
  switch (route.kind) {
    case 'destinations-index':
      return `${root}/destinations${route.page > 1 ? `?page=${route.page}` : ''}`;
    case 'destination':
      return `${root}/destinations/${encodeURIComponent(route.slug)}`;
    case 'guide':
      return `${root}/g/${encodeURIComponent(route.reference)}`;
    case 'creator':
      return `${root}/c/${encodeURIComponent(route.handle)}${route.page > 1 ? `?page=${route.page}` : ''}`;
    case 'experience':
      return `${root}/experiences/${encodeURIComponent(route.slug)}`;
    case 'merchant':
      return `${root}/m/${encodeURIComponent(route.slug)}`;
    case 'sessions-index':
      return `${root}/sessions`;
    case 'session':
      return `${root}/sessions/${encodeURIComponent(route.slug)}`;
  }
}
