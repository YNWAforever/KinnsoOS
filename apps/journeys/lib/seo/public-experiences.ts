import type { Metadata } from 'next';
import { backendTarget, type Environment } from '../contracts/capabilities.ts';
import { publicLabels } from './public-labels.ts';
import { publicLanguage } from './public-language.ts';
import { publicContentMetadata } from './public-presentation.ts';
import { readPublicRows } from './public-http.ts';
import { projectPublicMerchant } from './public-merchants.ts';
import { sanitizePublicTerms } from './public-terms.ts';

export type PublicExperienceCard = {
  slug: string;
  title: string;
  city: string;
  priceAmount: number;
  currency: string;
  coverUrl: string | null;
  savesCount: number;
};

export type PublicExperience = PublicExperienceCard & {
  id: string;
  summary: string | null;
  description: string | null;
  durationMinutes: number | null;
  publishedAt: string;
  merchant: { slug: string; companyName: string };
};

const columns =
  'id,slug,title,summary,description,city,price_amount,currency,duration_minutes,cover_url,published_at,saves_count,merchant_profile_id';
const identifier = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]{0,199}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currencies = new Set(['HKD', 'USD', 'SGD', 'JPY', 'KRW', 'THB', 'TWD', 'CNY']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('experience_schema');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, max: number, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length > max) throw new Error('experience_schema');
  return value;
}

function safeImage(value: unknown): string | null {
  if (value === null) return null;
  const source = string(value, 2_048);
  try {
    const url = new URL(source!);
    return url.origin === 'https://cdn.kinnso.ai' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function number(value: unknown, minimum: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new Error('experience_schema');
  }
  return value;
}

export function projectPublicExperienceCard(value: unknown): PublicExperienceCard & {
  merchantProfileId: string;
  id: string;
  description: string | null;
  summary: string | null;
  durationMinutes: number | null;
  publishedAt: string;
} {
  const row = record(value);
  const slug = string(row.slug, 200);
  const title = string(row.title, 500);
  const city = string(row.city, 500);
  const currency = string(row.currency, 8);
  const merchantProfileId = string(row.merchant_profile_id, 64);
  const id = string(row.id, 64);
  const publishedAt = string(row.published_at, 100);
  if (
    typeof slug !== 'string' ||
    !identifier.test(slug) ||
    typeof title !== 'string' ||
    !title.trim() ||
    typeof city !== 'string' ||
    !city.trim() ||
    typeof currency !== 'string' ||
    !currencies.has(currency) ||
    typeof merchantProfileId !== 'string' ||
    !uuid.test(merchantProfileId) ||
    typeof id !== 'string' ||
    !uuid.test(id) ||
    typeof publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(publishedAt)) ||
    (row.status !== undefined && row.status !== 'published')
  ) {
    throw new Error('experience_schema');
  }
  const durationMinutes =
    row.duration_minutes === null ? null : number(row.duration_minutes, 1, true);
  return {
    id,
    slug,
    title,
    summary: string(row.summary, 20_000, true),
    description: string(row.description, 100_000, true),
    city,
    priceAmount: number(row.price_amount, 0),
    currency,
    durationMinutes,
    coverUrl: safeImage(row.cover_url),
    publishedAt,
    savesCount: number(row.saves_count, 0, true),
    merchantProfileId,
  };
}

export async function readPublicExperience(
  slug: string,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<PublicExperience | null> {
  if (typeof slug !== 'string') return null;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  if (!identifier.test(slug)) return null;
  const target = backendTarget(env);
  if (!target) throw new Error('experience_unconfigured');
  const url = new URL('/rest/v1/experiences', target.origin);
  url.search = new URLSearchParams({
    select: columns,
    slug: `eq.${slug}`,
    status: 'eq.published',
    limit: '2',
  }).toString();
  const rows = await readPublicRows(url, target.key, transport, undefined, {
    unavailableCode: 'experience_unavailable',
    schemaCode: 'experience_schema',
  });
  if (rows.length > 1) throw new Error('experience_schema');
  if (!rows.length) return null;
  const card = projectPublicExperienceCard(rows[0]);
  if (card.slug !== slug) throw new Error('experience_schema');
  const merchantUrl = new URL('/rest/v1/merchant_public_profiles', target.origin);
  merchantUrl.search = new URLSearchParams({
    select: 'id,slug,company_name,tagline,city,logo_url,website_url,created_at',
    id: `eq.${card.merchantProfileId}`,
    limit: '2',
  }).toString();
  const merchants = await readPublicRows(merchantUrl, target.key, transport, undefined, {
    unavailableCode: 'experience_unavailable',
    schemaCode: 'experience_schema',
  });
  if (merchants.length > 1) throw new Error('experience_schema');
  if (!merchants.length) return null;
  const merchant = projectPublicMerchant(merchants[0]);
  if (merchant.id !== card.merchantProfileId) throw new Error('experience_schema');
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    summary: card.summary,
    description: card.description,
    city: card.city,
    priceAmount: card.priceAmount,
    currency: card.currency,
    durationMinutes: card.durationMinutes,
    coverUrl: card.coverUrl,
    publishedAt: card.publishedAt,
    savesCount: card.savesCount,
    merchant: { slug: merchant.slug, companyName: merchant.companyName },
  };
}

export async function readMerchantExperiences(
  merchantId: string,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<PublicExperienceCard[]> {
  if (!uuid.test(merchantId)) return [];
  const target = backendTarget(env);
  if (!target) throw new Error('experience_unconfigured');
  const url = new URL('/rest/v1/experiences', target.origin);
  url.search = new URLSearchParams({
    select: columns,
    merchant_profile_id: `eq.${merchantId}`,
    status: 'eq.published',
    order: 'published_at.desc,id.asc',
    limit: '12',
  }).toString();
  const rows = await readPublicRows(url, target.key, transport, undefined, {
    unavailableCode: 'experience_unavailable',
    schemaCode: 'experience_schema',
  });
  if (rows.length > 12) throw new Error('experience_schema');
  const seen = new Set<string>();
  return rows.map(value => {
    const card = projectPublicExperienceCard(value);
    if (card.merchantProfileId !== merchantId || seen.has(card.slug)) {
      throw new Error('experience_schema');
    }
    seen.add(card.slug);
    return {
      slug: card.slug,
      title: card.title,
      city: card.city,
      priceAmount: card.priceAmount,
      currency: card.currency,
      coverUrl: card.coverUrl,
      savesCount: card.savesCount,
    };
  });
}

export async function readPublicExperienceCardsForTerms(
  terms: readonly string[],
  limit: number,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<PublicExperienceCard[]> {
  const clean = sanitizePublicTerms(terms);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 6 || !clean.length) return [];
  const target = backendTarget(env);
  if (!target) throw new Error('experience_unconfigured');
  const url = new URL('/rest/v1/experiences', target.origin);
  url.search = new URLSearchParams({
    select: columns,
    status: 'eq.published',
    or: `(${clean.map(term => `city.ilike.%${term}%`).join(',')})`,
    order: 'published_at.desc,id.asc',
    limit: String(limit),
  }).toString();
  const rows = await readPublicRows(url, target.key, transport, undefined, {
    unavailableCode: 'experience_unavailable',
    schemaCode: 'experience_schema',
  });
  if (rows.length > limit) throw new Error('experience_schema');
  const seen = new Set<string>();
  return rows.map(value => {
    const card = projectPublicExperienceCard(value);
    if (seen.has(card.slug)) throw new Error('experience_schema');
    seen.add(card.slug);
    return {
      slug: card.slug,
      title: card.title,
      city: card.city,
      priceAmount: card.priceAmount,
      currency: card.currency,
      coverUrl: card.coverUrl,
      savesCount: card.savesCount,
    };
  });
}

export function experiencePageMetadata(experience: PublicExperience, locale: string): Metadata {
  const labels = publicLabels(locale);
  if (!labels || !publicLanguage(locale)) throw new Error('experience_locale');
  if (!identifier.test(experience.slug) || !experience.title.trim()) {
    throw new Error('experience_schema');
  }
  return publicContentMetadata({
    locale,
    path: `/experiences/${encodeURIComponent(experience.slug)}`,
    title: experience.title,
    description:
      experience.summary ||
      labels.experiences.metadataDescription(experience.title, experience.city),
  });
}
