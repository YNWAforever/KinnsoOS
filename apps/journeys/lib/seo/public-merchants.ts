import type { Metadata } from 'next';
import { backendTarget, type Environment } from '../contracts/capabilities.ts';
import { publicLabels } from './public-labels.ts';
import { publicLanguage } from './public-language.ts';
import { publicContentMetadata } from './public-presentation.ts';
import { readPublicRows } from './public-http.ts';

export type PublicMerchant = {
  id: string;
  slug: string;
  companyName: string;
  tagline: string | null;
  city: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export const PUBLIC_MERCHANT_COLUMNS =
  'id,slug,company_name,tagline,city,logo_url,website_url,created_at';

const identifier = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]{0,199}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('merchant_schema');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length > max) throw new Error('merchant_schema');
  return value;
}

function cdnsImage(value: unknown): string | null {
  if (value === null) return null;
  const source = text(value, 2_048);
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

function httpsUrl(value: unknown): string | null {
  if (value === null) return null;
  const source = text(value, 2_048);
  try {
    const url = new URL(source!);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function projectPublicMerchant(value: unknown, expectedSlug?: string): PublicMerchant {
  const row = record(value);
  const id = text(row.id, 64);
  const slug = text(row.slug, 200);
  const companyName = text(row.company_name, 500);
  const createdAt = text(row.created_at, 100);
  if (
    typeof id !== 'string' ||
    !uuid.test(id) ||
    typeof slug !== 'string' ||
    !identifier.test(slug) ||
    (expectedSlug !== undefined && slug !== expectedSlug) ||
    typeof companyName !== 'string' ||
    !companyName.trim() ||
    typeof createdAt !== 'string' ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    throw new Error('merchant_schema');
  }
  return {
    id,
    slug,
    companyName,
    tagline: text(row.tagline, 2_000, true),
    city: text(row.city, 500, true),
    logoUrl: cdnsImage(row.logo_url),
    websiteUrl: httpsUrl(row.website_url),
  };
}

export async function readPublicMerchant(
  slug: string,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<PublicMerchant | null> {
  if (typeof slug !== 'string') return null;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  if (!identifier.test(slug)) return null;
  const target = backendTarget(env);
  if (!target) throw new Error('merchant_unconfigured');
  const url = new URL('/rest/v1/merchant_public_profiles', target.origin);
  url.search = new URLSearchParams({
    select: PUBLIC_MERCHANT_COLUMNS,
    slug: `eq.${slug}`,
    limit: '2',
  }).toString();
  const rows = await readPublicRows(url, target.key, transport, undefined, {
    unavailableCode: 'merchant_unavailable',
    schemaCode: 'merchant_schema',
  });
  if (rows.length > 1) throw new Error('merchant_schema');
  return rows.length ? projectPublicMerchant(rows[0], slug) : null;
}

export function merchantPageMetadata(merchant: PublicMerchant, locale: string): Metadata {
  const labels = publicLabels(locale);
  if (!labels || !publicLanguage(locale)) throw new Error('merchant_locale');
  if (!identifier.test(merchant.slug) || !merchant.companyName.trim()) {
    throw new Error('merchant_schema');
  }
  return publicContentMetadata({
    locale,
    path: `/m/${encodeURIComponent(merchant.slug)}`,
    title: merchant.companyName,
    description: merchant.tagline || labels.merchants.metadataDescription(merchant.companyName),
    type: 'profile',
  });
}
