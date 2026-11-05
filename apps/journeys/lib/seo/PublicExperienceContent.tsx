import Link from 'next/link';
import { publicLabels } from './public-labels.ts';
import type { PublicExperience } from './public-experiences.ts';

export function PublicExperienceContent({
  experience,
  locale,
}: {
  experience: PublicExperience;
  locale: string;
}) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return (
    <main className="k-page">
      <nav aria-label={labels.experiences.backToMerchant}>
        <Link href={`/${locale}/m/${encodeURIComponent(experience.merchant.slug)}`}>
          {labels.experiences.backToMerchant} {experience.merchant.companyName}
        </Link>
      </nav>
      <article>
        {experience.coverUrl && (
          <img
            src={experience.coverUrl}
            alt={experience.title}
            loading="lazy"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        )}
        <h1 lang="">{experience.title}</h1>
        <p>{experience.city}</p>
        <p lang={locale}>
          {labels.experiences.priceLabel} {experience.currency} {experience.priceAmount.toLocaleString(locale)}
          {experience.durationMinutes !== null && (
            <> · {labels.experiences.durationLabel} {experience.durationMinutes} {labels.experiences.minutesSuffix}</>
          )}
        </p>
        {experience.summary && <p lang="">{experience.summary}</p>}
        {experience.description && <div lang="" style={{ whiteSpace: 'pre-wrap' }}>{experience.description}</div>}
        <p lang={locale}>
          {labels.experiences.hostedBy}{' '}
          <Link href={`/${locale}/m/${encodeURIComponent(experience.merchant.slug)}`} lang="">
            {experience.merchant.companyName}
          </Link>
        </p>
      </article>
    </main>
  );
}
