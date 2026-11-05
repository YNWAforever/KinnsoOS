import type { Metadata } from 'next';
import { backendTarget, type Environment } from '../contracts/capabilities.ts';
import { publicLabels } from './public-labels.ts';
import { publicContentMetadata } from './public-presentation.ts';
import { readPublicRows } from './public-http.ts';

export type PublicSession = {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: string;
  startsAt: string;
  durationMinutes: number;
  destinationTags: string[];
  status: 'scheduled' | 'live' | 'ended';
  replayUrl: string | null;
  host: { handle: string; displayName: string } | null;
};

export type SessionDiscovery = {
  status: 'ready' | 'empty' | 'unavailable';
  items: PublicSession[];
};

type SessionRecord = Omit<PublicSession, 'host'> & { hostCreatorId: string };

const columns =
  'id,slug,title,description,type,starts_at,duration_minutes,replay_url,destination_tags,status,host_creator_id';
const identifier = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_.-]{0,199}$/u;
const handlePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types = new Set([
  'destination_briefing',
  'ask_a_creator',
  'merchant_spotlight',
  'new_creator_intro',
]);
const statuses = new Set(['scheduled', 'live', 'ended']);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('session_schema');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('session_schema');
  return value;
}

function integer(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error('session_schema');
  }
  return value;
}

function httpsUrl(value: unknown): string | null {
  if (value === null) return null;
  const source = text(value, 2_048);
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function projectSession(value: unknown, direct = false): SessionRecord | null {
  const row = record(value);
  const id = text(row.id, 64);
  const slug = text(row.slug, 200);
  const creatorId = text(row.host_creator_id, 64);
  const title = text(row.title, 500);
  const description = text(row.description, 50_000);
  const type = text(row.type, 64);
  const startsAt = text(row.starts_at, 100);
  const status = text(row.status, 32);
  if (!uuid.test(id) || !identifier.test(slug) || !uuid.test(creatorId) || !title.trim() ||
      !types.has(type) || !Number.isFinite(Date.parse(startsAt))) {
    throw new Error('session_schema');
  }
  if (!statuses.has(status)) {
    if (direct && ['cancelled', 'unknown'].includes(status)) return null;
    throw new Error('session_schema');
  }
  if (!Array.isArray(row.destination_tags) || row.destination_tags.length > 100) {
    throw new Error('session_schema');
  }
  const destinationTags = row.destination_tags.map(value => text(value, 200));
  return {
    id,
    slug,
    title,
    description,
    type,
    startsAt,
    durationMinutes: integer(row.duration_minutes, 1),
    destinationTags,
    status: status as PublicSession['status'],
    replayUrl: status === 'ended' ? httpsUrl(row.replay_url) : null,
    hostCreatorId: creatorId,
  };
}

async function readHosts(
  creatorIds: string[],
  target: { origin: string; key: string },
  transport: typeof fetch,
): Promise<Map<string, PublicSession['host']>> {
  const ids = [...new Set(creatorIds)];
  if (!ids.length) return new Map();
  if (ids.length > 20 || ids.some(id => !uuid.test(id))) throw new Error('session_schema');
  const url = new URL('/rest/v1/creators', target.origin);
  url.search = new URLSearchParams({
    select: 'id,handle,display_name',
    id: `in.(${ids.join(',')})`,
    status: 'eq.active',
    public_profile: 'not.is.null',
    limit: '21',
  }).toString();
  const rows = await readPublicRows(url, target.key, transport, undefined, {
    unavailableCode: 'session_unavailable',
    schemaCode: 'session_schema',
  });
  if (rows.length > ids.length) throw new Error('session_schema');
  const result = new Map<string, PublicSession['host']>();
  for (const value of rows) {
    const row = record(value);
    const id = text(row.id, 64);
    const handle = text(row.handle, 80);
    const displayName = text(row.display_name, 500);
    if (!uuid.test(id) || !handlePattern.test(handle) || !displayName.trim() || !ids.includes(id)) {
      throw new Error('session_schema');
    }
    result.set(id, { handle, displayName });
  }
  return result;
}

async function withHosts(
  records: SessionRecord[],
  target: { origin: string; key: string },
  transport: typeof fetch,
): Promise<PublicSession[]> {
  const hosts = await readHosts(records.map(item => item.hostCreatorId), target, transport);
  return records.map(({ hostCreatorId, ...session }) => ({
    ...session,
    host: hosts.get(hostCreatorId) ?? null,
  }));
}

export async function readPublicSessionDiscovery(
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<SessionDiscovery> {
  const target = backendTarget(env);
  if (!target) return { status: 'unavailable', items: [] };
  const base = new URL('/rest/v1/community_sessions', target.origin);
  const upcomingUrl = new URL(base);
  upcomingUrl.search = new URLSearchParams({
    select: columns,
    status: 'in.(scheduled,live)',
    order: 'starts_at.asc,id.asc',
    limit: '21',
  }).toString();
  const replayUrl = new URL(base);
  replayUrl.search = new URLSearchParams({
    select: columns,
    status: 'eq.ended',
    replay_url: 'not.is.null',
    order: 'starts_at.desc,id.asc',
    limit: '21',
  }).toString();
  try {
    const [upcomingRows, replayRows] = await Promise.all([
      readPublicRows(upcomingUrl, target.key, transport, undefined, {
        unavailableCode: 'session_unavailable',
        schemaCode: 'session_schema',
      }),
      readPublicRows(replayUrl, target.key, transport, undefined, {
        unavailableCode: 'session_unavailable',
        schemaCode: 'session_schema',
      }),
    ]);
    const records = [...upcomingRows, ...replayRows]
      .map(value => projectSession(value))
      .filter((value): value is SessionRecord => value !== null);
    const seen = new Set<string>();
    const unique = records.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, 20);
    if (!unique.length) return { status: 'empty', items: [] };
    return { status: 'ready', items: await withHosts(unique, target, transport) };
  } catch {
    return { status: 'unavailable', items: [] };
  }
}

export async function readPublicSession(
  slug: string,
  env: Environment,
  transport: typeof fetch = fetch,
): Promise<PublicSession | null> {
  if (typeof slug !== 'string') return null;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  if (!identifier.test(slug)) return null;
  const target = backendTarget(env);
  if (!target) throw new Error('session_unconfigured');
  const url = new URL('/rest/v1/community_sessions', target.origin);
  url.search = new URLSearchParams({ select: columns, slug: `eq.${slug}`, limit: '2' }).toString();
  const rows = await readPublicRows(url, target.key, transport, undefined, {
    unavailableCode: 'session_unavailable',
    schemaCode: 'session_schema',
  });
  if (rows.length > 1) throw new Error('session_schema');
  if (!rows.length) return null;
  const session = projectSession(rows[0], true);
  if (!session) return null;
  if (session.slug !== slug) throw new Error('session_schema');
  return (await withHosts([session], target, transport))[0];
}

export function sessionIndexMetadata(locale: string): Metadata {
  const labels = publicLabels(locale);
  if (!labels) throw new Error('unsupported_public_language');
  return publicContentMetadata({
    locale,
    path: '/sessions',
    title: labels.sessions.title,
    description: labels.sessions.body,
  });
}

export function sessionPageMetadata(session: PublicSession, locale: string): Metadata {
  const labels = publicLabels(locale);
  if (!labels || !identifier.test(session.slug) || !session.title.trim()) {
    throw new Error('session_schema');
  }
  return publicContentMetadata({
    locale,
    path: `/sessions/${encodeURIComponent(session.slug)}`,
    title: session.title,
    description: labels.sessions.metadataDescription(
      session.title,
      session.host?.displayName || 'Kinnso',
    ),
  });
}
