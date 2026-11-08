import type { Metadata } from 'next';
import { publicLanguage } from './public-language.ts';
import { publicLabels } from './public-labels.ts';

export const KINNSOOS_CANONICAL_ORIGIN = 'https://kinnso-os.vercel.app';

export function publicContentMetadata({
  locale,
  path,
  title,
  description,
  type = 'website',
}: {
  locale: string;
  path: string;
  title: string;
  description: string;
  type?: 'website' | 'article' | 'profile';
}): Metadata {
  const language = publicLanguage(locale);
  if (!language) throw new Error('unsupported_public_language');
  const canonical = `${KINNSOOS_CANONICAL_ORIGIN}/${language}${path}`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical },
    openGraph: { type, url: canonical, title, description },
    twitter: { card: 'summary', title, description },
  };
}

export function publicMetadataDescription(locale: string, kind: 'experience' | 'merchant', values: string[]) {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return kind === 'experience'
    ? labels.experiences.metadataDescription(values[0], values[1])
    : labels.merchants.metadataDescription(values[0]);
}
