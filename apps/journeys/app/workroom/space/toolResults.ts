import type { ChatMessage } from '../../../lib/chat/contracts';
import { isUuid } from '../../../lib/chat/contracts';
import { readList, readRecord, readText } from './values';

/**
 * Source cards for assistant turns.
 *
 * Canonical persisted shape (Lead/chat-server contract):
 *   metadata.sources: Array<{ kind: 'guide' | 'trip', id: uuid, title: string, city?: string }>
 * Live SSE tool events may carry the same array for one call, and older
 * payloads may nest structured results under `toolPayload`. Everything is read
 * defensively: an unknown shape degrades to tool chips or plain text cards and
 * a link is only built from a valid uuid.
 */
export type SourceKind = 'guide' | 'trip';

export type SourceCard = {
  key: string;
  kind: SourceKind;
  /** Null when the payload had no valid uuid: the card renders as plain text. */
  id: string | null;
  title: string;
  city: string | null;
  snippet: string | null;
};

export type ToolTrace = { key: string; name: string; ok: boolean; summary: string | null };

export type ParsedToolResults = { cards: SourceCard[]; traces: ToolTrace[] };

export type LiveTool = {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
  sources?: SourceCard[];
};

const MAX_CARDS = 12;
const MAX_TRACES = 6;
const GUIDE_WORDS = ['guide', 'guides', '攻略'];
const TRIP_WORDS = ['trip', 'trips', '行程'];

function hasWord(value: string, words: string[]): boolean {
  const lower = value.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function sourceKind(value: unknown): SourceKind | null {
  const text = readText(value)?.toLowerCase();
  if (!text) return null;
  if (text === 'guide' || text === 'guides') return 'guide';
  if (text === 'trip' || text === 'trips') return 'trip';
  if (hasWord(text, GUIDE_WORDS)) return 'guide';
  if (hasWord(text, TRIP_WORDS)) return 'trip';
  return null;
}

/** Reads `/g/{uuid}` or `/trips/{uuid}` and returns the canonical id/kind. */
function pathHint(value: unknown): { kind: SourceKind; id: string } | null {
  const path = readText(value);
  if (!path) return null;
  const guide = /^\/g\/([0-9a-f-]{36})\/?$/i.exec(path);
  if (guide && isUuid(guide[1])) return { kind: 'guide', id: guide[1] };
  const trip = /^\/trips\/([0-9a-f-]{36})\/?$/i.exec(path);
  if (trip && isUuid(trip[1])) return { kind: 'trip', id: trip[1] };
  return null;
}

function firstText(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const text = readText(item[key]);
    if (text) return text;
  }
  return null;
}

function cardFromItem(raw: unknown, fallbackKind: SourceKind | null): Omit<SourceCard, 'key'> | null {
  const item = readRecord(raw);
  if (!item) return null;
  const hinted = pathHint(item.path) ?? pathHint(item.href) ?? pathHint(item.url);
  const explicitKind = sourceKind(item.kind) ?? sourceKind(item.type);
  const directId = firstText(item, ['id', 'guideId', 'guide_id', 'tripId', 'trip_id']);
  const titleField = firstText(item, ['title', 'label', 'guideTitle']);
  // A tool trace also carries `name` + `ok`/`summary`, but it is not a result:
  // require a real identity signal before turning anything into a source card.
  if (!titleField && !hinted && !explicitKind && !directId) return null;
  const kind = explicitKind ?? hinted?.kind ?? fallbackKind;
  if (!kind) return null;
  const title = titleField ?? firstText(item, ['name']);
  if (!title) return null;
  const city = firstText(item, ['city', 'destination', 'cityName']) ?? readText(readRecord(item.location)?.city);
  const summary = firstText(item, ['summary', 'snippet', 'description', 'excerpt']);
  const id = directId && isUuid(directId) ? directId : hinted?.id ?? null;
  return {
    kind,
    id,
    title: title.slice(0, 160),
    city: city ? city.slice(0, 80) : null,
    snippet: summary ? summary.slice(0, 200) : null,
  };
}

function cardKey(card: Omit<SourceCard, 'key'>): string {
  return `${card.kind}:${card.id ?? `text:${card.title.toLowerCase()}:${card.city ?? ''}`}`;
}

/** Parses an array of source-ish items (canonical or legacy) into bounded cards. */
export function parseSourceList(raw: unknown, fallbackKind: SourceKind | null = null): SourceCard[] {
  const list = readList(raw);
  if (!list) return [];
  const cards: SourceCard[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (cards.length >= MAX_CARDS) break;
    const card = cardFromItem(item, fallbackKind);
    if (!card) continue;
    const key = cardKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ key, ...card });
  }
  return cards;
}

/** Canonical persisted sources: `message.metadata.sources`. Absent on older messages. */
export function metadataSources(message: ChatMessage): SourceCard[] {
  return parseSourceList(message.metadata?.sources);
}

type RawEntry = { name: string; raw: Record<string, unknown> | null };

function collectEntries(raw: unknown, nameHint: string, out: RawEntry[], depth: number): void {
  const list = readList(raw);
  if (list) {
    for (const item of list) collectEntries(item, nameHint, out, depth);
    return;
  }
  const record = readRecord(raw);
  if (!record) {
    const text = readText(raw);
    if (text) out.push({ name: text, raw: null });
    return;
  }
  const name = firstText(record, ['name', 'tool', 'toolName', 'type']) ?? nameHint;
  out.push({ name, raw: record });
  if (depth >= 2) return;
  for (const key of ['tools', 'results', 'sources', 'items', 'cards', 'data', 'structured', 'result', 'output', 'payload']) {
    if (key in record) collectEntries(record[key], name, out, depth + 1);
  }
}

function candidateBuckets(record: Record<string, unknown> | null): unknown[][] {
  if (!record) return [];
  const buckets: unknown[][] = [];
  for (const key of ['items', 'results', 'sources', 'cards', 'guides', 'trips', 'data', 'structured', 'result', 'output', 'payload']) {
    const value = record[key];
    const list = readList(value);
    if (list) {
      buckets.push(list);
      continue;
    }
    const nested = readRecord(value);
    if (!nested) continue;
    for (const nestedKey of ['items', 'results', 'sources', 'guides', 'trips', 'data']) {
      const nestedList = readList(nested[nestedKey]);
      if (nestedList) buckets.push(nestedList);
    }
  }
  return buckets;
}

/**
 * Tool-grounded demo turns (no model key configured) print the actual MCP tool
 * result into the body, so its bullet rows can be shown as plain text cards.
 * They never carry ids, so they are intentionally rendered without links.
 */
function toolGroundedCards(message: ChatMessage, fallbackKind: SourceKind): SourceCard[] {
  const model = readText(message.metadata?.model) ?? readText(readRecord(message.toolPayload)?.model);
  if (model !== 'none:tool-grounded') return [];
  const cards: SourceCard[] = [];
  for (const line of message.body.split(/\r?\n/)) {
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (!bullet) continue;
    const text = bullet[1].trim();
    if (!text) continue;
    // The tool-grounded renderer separates title and city with a spaced dot.
    const parts = text.split(/\s+(?:[·•|繚])\s+|[·•]\s+/);
    const title = (parts[0] ?? '').trim().slice(0, 160);
    if (!title) continue;
    const city = parts.length > 1 ? (parts[1] ?? '').trim().slice(0, 80) : '';
    cards.push({
      key: `text-grounded:${cards.length}:${title.toLowerCase()}:${city.toLowerCase()}`,
      kind: fallbackKind,
      id: null,
      title,
      city: city || null,
      snippet: null,
    });
    if (cards.length >= 5) break;
  }
  return cards;
}

function demoFallbackKind(message: ChatMessage, entries: RawEntry[]): SourceKind {
  const names = [
    ...entries.map((entry) => entry.name),
    ...(readList(message.metadata?.tools) ?? []).map((tool) => readText(tool) ?? ''),
  ].join(' ');
  if (hasWord(names, TRIP_WORDS) && !hasWord(names, GUIDE_WORDS)) return 'trip';
  return 'guide';
}

/** Everything a message can tell us about the read-only tools it used. */
export function parseToolResults(message: ChatMessage): ParsedToolResults {
  const cards: SourceCard[] = metadataSources(message);

  const entries: RawEntry[] = [];
  const meta = readRecord(message.metadata);
  collectEntries(meta?.tools, '', entries, 0);
  const payload = readRecord(message.toolPayload) ?? {};
  for (const key of ['tools', 'sources', 'results', 'items', 'structured']) {
    if (key in payload) collectEntries(payload[key], '', entries, 0);
  }

  const traces: ToolTrace[] = [];
  const seenTraces = new Set<string>();
  const seenCards = new Set(cards.map((card) => card.key));
  for (const entry of entries) {
    let produced = false;
    if (entry.raw) {
      const hintedKind = hasWord(entry.name, GUIDE_WORDS) ? 'guide' : hasWord(entry.name, TRIP_WORDS) ? 'trip' : null;
      for (const bucket of candidateBuckets(entry.raw)) {
        for (const candidate of parseSourceList(bucket, hintedKind)) {
          if (cards.length >= MAX_CARDS) break;
          if (seenCards.has(candidate.key)) continue;
          seenCards.add(candidate.key);
          cards.push(candidate);
          produced = true;
        }
      }
      if (!produced) {
        const single = cardFromItem(entry.raw, hintedKind);
        if (single) {
          const key = cardKey(single);
          if (!seenCards.has(key)) {
            seenCards.add(key);
            cards.push({ key, ...single });
            produced = true;
          }
        }
      }
    }
    if (produced || !entry.name) continue;
    const status = entry.raw ? readText(entry.raw.status) : null;
    const ok = entry.raw ? entry.raw.ok !== false && status !== 'error' && status !== 'failed' : true;
    const summary = entry.raw ? firstText(entry.raw, ['summary', 'message']) : null;
    const traceKey = `${entry.name}:${summary ?? ''}`;
    if (seenTraces.has(traceKey) || traces.length >= MAX_TRACES) continue;
    seenTraces.add(traceKey);
    traces.push({ key: `trace-${traces.length}`, name: entry.name, ok, summary });
  }

  if (cards.length === 0) cards.push(...toolGroundedCards(message, demoFallbackKind(message, entries)));

  return { cards: cards.slice(0, MAX_CARDS), traces: traces.slice(0, MAX_TRACES) };
}
