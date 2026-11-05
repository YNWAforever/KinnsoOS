import Link from 'next/link';
import type { ArticleListing } from './article-listing.ts';
import type { DestinationRelated, Section } from './destination-related.ts';
import { publicLabels } from './public-labels.ts';
import type { PublicDestination } from './public-destinations.ts';

function SectionUnavailable({ message }: { message: string }) {
  return <p role="alert">{message}</p>;
}

function Cards<T>({
  section,
  unavailable,
  render,
}: {
  section: Section<T>;
  unavailable: string;
  render: (item: T) => React.ReactNode;
}) {
  if (section.status === 'unavailable') return <SectionUnavailable message={unavailable} />;
  if (section.status === 'ready') return <ul>{section.items.map((item, index) => <li key={index}>{render(item)}</li>)}</ul>;
  return null;
}

function RelatedSection<T>({
  heading,
  section,
  unavailable,
  render,
}: {
  heading: string;
  section: Section<T>;
  unavailable: string;
  render: (item: T) => React.ReactNode;
}) {
  if (section.status === 'empty' || section.status === 'omitted') return null;
  return <section><h2>{heading}</h2><Cards section={section} unavailable={unavailable} render={render}/></section>;
}

export function PublicDestinationIndex({
  locale,
  page,
  hasNext,
  destinations,
}: {
  locale: string;
  page: number;
  hasNext: boolean;
  destinations: PublicDestination[];
}) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return (
    <main className="k-page">
      <p>{labels.destinations.eyebrow}</p>
      <h1>{labels.destinations.title}</h1>
      <p>{labels.destinations.body}</p>
      {destinations.length ? (
        <ul>
          {destinations.map(destination => (
            <li key={destination.slug} lang="">
              <Link href={`/${locale}/destinations/${encodeURIComponent(destination.slug)}`}>
                {destination.heroImageUrl && <img src={destination.heroImageUrl} alt="" loading="lazy" style={{ maxWidth: '100%', height: 'auto' }} />}
                <h2>{destination.name}</h2>
              </Link>
              {destination.description && <p>{destination.description}</p>}
              <p lang={locale}>
                {destination.guideCount > 0 && labels.destinations.guideCount(destination.guideCount)}
                {destination.guideCount > 0 && destination.experienceCount > 0 && ' · '}
                {destination.experienceCount > 0 && labels.destinations.experienceCount(destination.experienceCount)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{labels.destinations.empty}</p>
      )}
      <nav aria-label={labels.common.page}>
        {page > 1 && <Link href={`/${locale}/destinations${page - 1 > 1 ? `?page=${page - 1}` : ''}`}>{labels.common.previous}</Link>}
        <span> {labels.common.page} {page} </span>
        {hasNext && <Link href={`/${locale}/destinations?page=${page + 1}`}>{labels.common.next}</Link>}
      </nav>
    </main>
  );
}

export function PublicDestinationUnavailable({ locale }: { locale: string }) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return <main className="k-page"><p role="alert">{labels.common.unavailable}</p><a href={`/${locale}/destinations`}>{labels.common.retry}</a></main>;
}

export function PublicDestinationDetail({
  locale,
  destination,
  related,
}: {
  locale: string;
  destination: PublicDestination;
  related: DestinationRelated;
}) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return (
    <main className="k-page">
      <nav aria-label={labels.destinations.eyebrow}><Link href={`/${locale}/destinations`}>{labels.destinations.eyebrow}</Link></nav>
      <article lang="">
        {destination.heroImageUrl && <img src={destination.heroImageUrl} alt={destination.name} loading="lazy" style={{ maxWidth: '100%', height: 'auto' }} />}
        <h1>{destination.name}</h1>
        {destination.description && <p>{destination.description}</p>}
      </article>
      <RelatedSection heading={labels.destinations.guidesHeading} section={related.guides} unavailable={labels.common.unavailable} render={guide => (
          <Link href={`/${locale}/g/${guide.id}`} lang="">{guide.title}</Link>
        )} />
      <RelatedSection heading={labels.destinations.experiencesHeading} section={related.experiences} unavailable={labels.common.unavailable} render={experience => (
          <Link href={`/${locale}/experiences/${encodeURIComponent(experience.slug)}`} lang="">{experience.title}</Link>
        )} />
      <RelatedSection heading={labels.destinations.articlesHeading} section={related.articles} unavailable={labels.common.unavailable} render={article => (
          article.canOpen ? <Link href={article.href} lang="">{article.title}</Link> : <span lang="">{article.title}</span>
        )} />
      <RelatedSection heading={labels.destinations.sessionsHeading} section={related.sessions} unavailable={labels.common.unavailable} render={session => (
            <Link href={`/${locale}/sessions/${encodeURIComponent(session.slug)}`} lang="">{session.title}</Link>
          )} />
    </main>
  );
}
