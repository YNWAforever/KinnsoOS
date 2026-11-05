import Link from 'next/link';
import { publicLabels } from './public-labels.ts';
import type { PublicSession, SessionDiscovery } from './public-sessions.ts';

function SessionLinks({ locale, sessions }: { locale: string; sessions: PublicSession[] }) {
  return (
    <ul>
      {sessions.map(session => (
        <li key={session.id}>
          <Link className="public-content-link" href={`/${locale}/sessions/${encodeURIComponent(session.slug)}`} lang="">
            {session.title}
          </Link>
          <time dateTime={session.startsAt}> · {session.startsAt.slice(0, 10)}</time>
          {session.host && (
            <span>
              {' · '}
              <Link className="public-content-link" href={`/${locale}/c/${encodeURIComponent(session.host.handle)}`} lang="">
                {session.host.displayName}
              </Link>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PublicSessionsContent({
  locale,
  discovery,
}: {
  locale: string;
  discovery: SessionDiscovery;
}) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  if (discovery.status === 'unavailable') {
    return (
      <main className="k-page">
        <h1>{labels.sessions.title}</h1>
        <p role="alert">{labels.common.unavailable}</p>
        <a href={`/${locale}/sessions`}>{labels.common.retry}</a>
      </main>
    );
  }
  if (discovery.status === 'empty') {
    return (
      <main className="k-page">
        <h1>{labels.sessions.title}</h1>
        <p>{labels.sessions.emptyUpcoming}</p>
      </main>
    );
  }
  const upcoming = discovery.items.filter(item => item.status !== 'ended');
  const replays = discovery.items.filter(item => item.status === 'ended');
  return (
    <main className="k-page">
      <h1>{labels.sessions.title}</h1>
      <p>{labels.sessions.body}</p>
      {upcoming.length > 0 && (
        <section>
          <h2>{labels.sessions.upcomingHeading}</h2>
          <SessionLinks locale={locale} sessions={upcoming} />
        </section>
      )}
      {replays.length > 0 && (
        <section>
          <h2>{labels.sessions.replaysHeading}</h2>
          <SessionLinks locale={locale} sessions={replays} />
        </section>
      )}
    </main>
  );
}

export function PublicSessionUnavailable({ locale }: { locale: string }) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return (
    <main className="k-page">
      <p role="alert">{labels.common.unavailable}</p>
      <a href={`/${locale}/sessions`}>{labels.common.retry}</a>
    </main>
  );
}

export function PublicSessionContent({
  locale,
  session,
}: {
  locale: string;
  session: PublicSession;
}) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return (
    <main className="k-page">
      <nav aria-label={labels.sessions.eyebrow}>
        <Link className="public-content-link" href={`/${locale}/sessions`}>{labels.sessions.eyebrow}</Link>
      </nav>
      <article>
        <h1 lang="">{session.title}</h1>
        <time dateTime={session.startsAt}>{session.startsAt}</time>
        {session.description && <p lang="" style={{ whiteSpace: 'pre-wrap' }}>{session.description}</p>}
        {session.host && (
          <p>
            <Link className="public-content-link" href={`/${locale}/c/${encodeURIComponent(session.host.handle)}`} lang="">
              {session.host.displayName}
            </Link>
          </p>
        )}
        {session.replayUrl && (
          <a className="public-content-link" href={session.replayUrl} target="_blank" rel="noopener noreferrer">
            {labels.sessions.replaysHeading}
          </a>
        )}
      </article>
    </main>
  );
}
