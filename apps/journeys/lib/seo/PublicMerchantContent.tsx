import Link from 'next/link';
import { publicLabels } from './public-labels.ts';
import type { PublicExperienceCard } from './public-experiences.ts';
import type { PublicMerchant } from './public-merchants.ts';

export function PublicMerchantContent({
  locale,
  merchant,
  experiences,
}: {
  locale: string;
  merchant: PublicMerchant;
  experiences: PublicExperienceCard[];
}) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return (
    <main className="k-page">
      <article>
        {merchant.logoUrl && (
          <img
            src={merchant.logoUrl}
            alt={merchant.companyName}
            loading="lazy"
            style={{ width: 96, height: 96, objectFit: 'cover' }}
          />
        )}
        {merchant.city && <p lang="">{merchant.city}</p>}
        <h1 lang="">{merchant.companyName}</h1>
        {merchant.tagline && <p lang="">{merchant.tagline}</p>}
        {merchant.websiteUrl && (
          <a href={merchant.websiteUrl} target="_blank" rel="noopener noreferrer">
            {labels.merchants.websiteLabel}
          </a>
        )}
      </article>
      <section>
        <h2>{labels.merchants.experiencesHeading}</h2>
        {experiences.length ? (
          <ul>
            {experiences.map(experience => (
              <li key={experience.slug} lang="">
                <Link href={`/${locale}/experiences/${encodeURIComponent(experience.slug)}`}>
                  {experience.title}
                </Link>
                <span> · {experience.city}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{labels.merchants.experiencesEmpty}</p>
        )}
      </section>
    </main>
  );
}
