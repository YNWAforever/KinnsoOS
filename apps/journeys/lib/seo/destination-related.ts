import { type Environment } from '../contracts/capabilities.ts';
import { readArticleListing, articleCategories, type ArticleCategory, type ArticleListing } from './article-listing.ts';
import { readPublicExperienceCardsForTerms, type PublicExperienceCard } from './public-experiences.ts';
import { readPublicGuidesForTerms, type PublicGuideCard } from './public-guides.ts';
import { publicLanguage } from './public-language.ts';
import type { PublicDestination } from './public-destinations.ts';
import { readPublicSessionDiscovery, readSessionsForDestination, type PublicSession } from './public-sessions.ts';
import { sanitizePublicTerms } from './public-terms.ts';

export {readPublicGuidesForTerms} from './public-guides.ts';
export {destinationIndexMetadata,destinationPageMetadata} from './public-destinations.ts';

export type SectionState = 'ready' | 'empty' | 'unavailable' | 'omitted';
export type Section<T> = { status: SectionState; items: T[] };

export interface DestinationRelated {
  guides: Section<PublicGuideCard>;
  experiences: Section<PublicExperienceCard>;
  articles: Section<ArticleListing['items'][number]>;
  sessions: Section<PublicSession>;
}

export function sanitizeRelatedTerms(values: readonly string[]): string[] {
  return sanitizePublicTerms(values);
}

function section<T>(work: Promise<T[]>): Promise<Section<T>> {
  return work.then(
    items => ({ status: items.length ? 'ready' : 'empty', items }),
    () => ({ status: 'unavailable', items: [] }),
  );
}

async function readArticles(
  locale: string,
  terms: readonly string[],
  env: Environment,
  transport: typeof fetch,
): Promise<ArticleListing['items']> {
  const language = publicLanguage(locale);
  if (!language) throw new Error('article_locale');
  let query = '';
  for (const term of terms) {
    const next = query ? `${query} OR ${term}` : term;
    if (next.length > 200) break;
    query = next;
  }
  if (!query) throw new Error('article_query');
  const results = await Promise.all(
    (Object.keys(articleCategories) as ArticleCategory[]).map(category =>
      readArticleListing(
        language,
        category,
        { page: 1, q: query, region: null, tag: null },
        env,
        transport,
        6,
      ),
    ),
  );
  if (results.some(value => value === null)) throw new Error('article_schema');
  return results
    .flatMap(value => value!.items)
    .sort((left, right) =>
      right.publishedAt.localeCompare(left.publishedAt) || left.slug.localeCompare(right.slug),
    )
    .slice(0, 6);
}

async function readSessions(
  terms: readonly string[],
  env: Environment,
  transport: typeof fetch,
): Promise<Section<PublicSession>> {
  const discovery = await readPublicSessionDiscovery(env, transport);
  if (discovery.status === 'unavailable') return { status: 'unavailable', items: [] };
  if (discovery.status === 'empty' || !discovery.items.length) {
    return { status: 'omitted', items: [] };
  }
  const related = await readSessionsForDestination(terms, env, transport);
  if (related.status === 'unavailable') return { status: 'unavailable', items: [] };
  return { status: related.items.length ? 'ready' : 'empty', items: related.items };
}

export async function readDestinationRelated(
  destination: PublicDestination,
  locale: string,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<DestinationRelated> {
  const terms = sanitizeRelatedTerms([destination.name, ...destination.matchTerms]);
  const [guides, experiences, articles, sessions] = await Promise.all([
    section(readPublicGuidesForTerms(terms, 6, env, transport)),
    section(readPublicExperienceCardsForTerms(terms, 6, env, transport)),
    section(readArticles(locale, terms, env, transport)),
    readSessions(terms, env, transport),
  ]);
  return { guides, experiences, articles, sessions };
}
