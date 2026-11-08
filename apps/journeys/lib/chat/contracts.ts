export type ChatRole = 'user' | 'assistant' | 'tool';

/** A guide/trip surfaced by an MCP tool result, safe to link from the client. */
export type ChatToolSource = {
  kind: 'guide' | 'trip';
  id: string;
  title: string;
  city?: string;
  path: string;
};

/** Bounded assistant bookkeeping stored with each message (never rendered raw). */
export type ChatMessageMetadata = {
  model?: string;
  latencyMs?: number;
  toolCount?: number;
  tools?: string[];
  sources?: ChatToolSource[];
  [key: string]: unknown;
};

export type ChatMessage = {
  id: string;
  sequence: number;
  role: ChatRole;
  body: string;
  toolName: string | null;
  toolPayload: Record<string, unknown>;
  metadata: ChatMessageMetadata;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  spaceId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  archivedAt?: string | null;
  pinnedAt?: string | null;
};

export type ChatSpace = {
  id: string;
  name: string;
  description: string;
  threadCount: number;
  updatedAt: string;
  archivedAt?: string | null;
};

export type ChatThreadDetail = ChatThread & { messages: ChatMessage[]; model?: string };

/** One owner-scoped search hit: a space or a chat with an optional body snippet. */
export type ChatSearchItem = {
  type: 'space' | 'chat';
  id: string;
  spaceId?: string | null;
  threadId?: string | null;
  title: string;
  snippet: string | null;
};

/** Current-hour model-turn budget plus lifetime workspace totals. */
export type ChatUsage = {
  used: number;
  limit: number;
  resetAt: string;
  spaces: number;
  threads: number;
  messages: number;
};

export type ChatSpaceUpdate = { name?: string; description?: string; archived?: boolean };

export type ChatThreadUpdate = { title?: string; archived?: boolean; pinned?: boolean };

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function defaultSpaceName(locale: 'en' | 'zh-HK'): string {
  return locale === 'zh-HK' ? '我的空間' : 'My space';
}

export function defaultChatTitle(locale: 'en' | 'zh-HK'): string {
  return locale === 'zh-HK' ? '新的對話' : 'New chat';
}

const DEFAULT_TURNS_PER_HOUR = 30;
const MAX_TURNS_PER_HOUR = 200;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const MAX_SEARCH_QUERY = 80;
const MAX_TOOL_NAMES = 24;
const MAX_TOOL_NAME = 80;
const MAX_MODEL_NAME = 120;
const MAX_SOURCES_PER_RESULT = 6;
const MAX_SOURCES_PER_TURN = 24;
const MAX_SOURCE_TITLE = 120;
const MAX_SOURCE_CITY = 80;
const MAX_METADATA_SOURCE_BYTES = 11000;

/** Mirrors chat_reserve_turn's 1..200 clamp; bad or missing config falls back to 30. */
export function chatTurnLimit(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_TURNS_PER_HOUR;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TURNS_PER_HOUR);
}

/** Mirrors chat_search's 1..50 clamp; bad or missing input falls back to 20. */
export function searchLimit(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_SEARCH_LIMIT);
}

/** Trimmed 1..80 character query, or null when the caller must reject it. */
export function searchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const query = value.trim();
  return query.length >= 1 && query.length <= MAX_SEARCH_QUERY ? query : null;
}

export function regenerateRequested(value: unknown): boolean {
  return value === true;
}

/**
 * Validates a PATCH /api/spaces/{spaceId} body. Unknown keys are ignored;
 * an empty object is a valid no-op. Returns null for anything malformed.
 */
export function parseSpaceUpdate(value: unknown): ChatSpaceUpdate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const update: ChatSpaceUpdate = {};
  if (input.name !== undefined) {
    if (typeof input.name !== 'string') return null;
    const name = input.name.trim();
    if (name.length < 1 || name.length > 80) return null;
    update.name = name;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string') return null;
    const description = input.description.trim();
    if (description.length > 280) return null;
    update.description = description;
  }
  if (input.archived !== undefined) {
    if (typeof input.archived !== 'boolean') return null;
    update.archived = input.archived;
  }
  return update;
}

/**
 * Validates a PATCH /api/spaces/{spaceId}/chats/{threadId} body. Unknown keys
 * are ignored; an empty object is a valid no-op. Returns null when malformed.
 */
export function parseThreadUpdate(value: unknown): ChatThreadUpdate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const update: ChatThreadUpdate = {};
  if (input.title !== undefined) {
    if (typeof input.title !== 'string') return null;
    const title = input.title.trim();
    if (title.length < 1 || title.length > 120) return null;
    update.title = title;
  }
  if (input.archived !== undefined) {
    if (typeof input.archived !== 'boolean') return null;
    update.archived = input.archived;
  }
  if (input.pinned !== undefined) {
    if (typeof input.pinned !== 'boolean') return null;
    update.pinned = input.pinned;
  }
  return update;
}

function sourcePrefix(kind: 'guide' | 'trip'): string {
  return kind === 'guide' ? '/g/' : '/trips/';
}

/**
 * One MCP tool item -> linkable source. The kind is derived only from the
 * canonical path shape and a caller-supplied kind is ignored; the trailing
 * UUID must equal the item id, otherwise the item is dropped (never invented).
 */
function sourceFromItem(raw: unknown): ChatToolSource | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as { kind?: unknown; id?: unknown; title?: unknown; city?: unknown; path?: unknown };
  if (typeof item.id !== 'string' || !isUuid(item.id)) return null;
  if (typeof item.path !== 'string' || typeof item.title !== 'string') return null;
  const kind = item.path.startsWith('/g/') ? 'guide' : item.path.startsWith('/trips/') ? 'trip' : null;
  if (!kind) return null;
  const prefix = sourcePrefix(kind);
  const trailing = item.path.slice(prefix.length);
  if (!isUuid(trailing) || trailing.toLowerCase() !== item.id.toLowerCase()) return null;
  const title = item.title.trim().slice(0, MAX_SOURCE_TITLE);
  if (!title) return null;
  const source: ChatToolSource = { kind, id: item.id, title, path: prefix + item.id };
  if (typeof item.city === 'string') {
    const city = item.city.trim().slice(0, MAX_SOURCE_CITY);
    if (city) source.city = city;
  }
  return source;
}

/**
 * Extracts the guide/trip sources from one MCP tool `structured` payload
 * ({items:[...]}). Absent or malformed payloads yield [] and never throw.
 */
export function toolSources(structured: unknown): ChatToolSource[] {
  try {
    const items = structured && typeof structured === 'object' && !Array.isArray(structured)
      ? (structured as { items?: unknown }).items
      : undefined;
    if (!Array.isArray(items)) return [];
    const sources: ChatToolSource[] = [];
    for (const item of items) {
      const source = sourceFromItem(item);
      if (!source || sources.some((existing) => existing.kind === source.kind && existing.id === source.id)) continue;
      sources.push(source);
      if (sources.length >= MAX_SOURCES_PER_RESULT) break;
    }
    return sources;
  } catch {
    return [];
  }
}

/**
 * Flattens source groups (one per tool call), revalidates every entry, dedupes
 * by kind+id and caps the turn at 24. Accepts unknown input without throwing.
 */
export function mergeToolSources(groups: unknown): ChatToolSource[] {
  try {
    if (!Array.isArray(groups)) return [];
    const merged: ChatToolSource[] = [];
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const entry of group) {
        const source = sourceFromItem(entry);
        if (!source || merged.some((existing) => existing.kind === source.kind && existing.id === source.id)) continue;
        merged.push(source);
        if (merged.length >= MAX_SOURCES_PER_TURN) return merged;
      }
    }
    return merged;
  } catch {
    return [];
  }
}

/** Keeps metadata.sources inside the 16KB message budget proven by the RPC. */
function metadataSources(value: unknown): ChatToolSource[] {
  const bounded: ChatToolSource[] = [];
  const encoder = new TextEncoder();
  let bytes = 2;
  for (const source of mergeToolSources([value])) {
    const size = encoder.encode(JSON.stringify(source)).length + 1;
    if (bytes + size > MAX_METADATA_SOURCE_BYTES) break;
    bytes += size;
    bounded.push(source);
  }
  return bounded;
}

/** Builds the bounded assistant metadata persisted with a completed turn. */
export function assistantMetadata(result: { model?: unknown; tools?: unknown; sources?: unknown } | null | undefined, latencyMs: unknown): ChatMessageMetadata {
  const names = Array.isArray(result?.tools)
    ? result.tools.map((tool) => {
      const name = typeof tool === 'string'
        ? tool
        : tool && typeof tool === 'object'
          ? (tool as { name?: unknown }).name
          : null;
      return typeof name === 'string' ? name.trim().slice(0, MAX_TOOL_NAME) : '';
    })
    : [];
  const tools = [...new Set(names.filter((name) => name.length > 0))].slice(0, MAX_TOOL_NAMES);
  const latency = typeof latencyMs === 'number' && Number.isFinite(latencyMs)
    ? Math.max(0, Math.round(latencyMs))
    : 0;
  const model = typeof result?.model === 'string' && result.model.trim()
    ? result.model.trim().slice(0, MAX_MODEL_NAME)
    : 'unknown';
  const metadata: ChatMessageMetadata = { model, latencyMs: latency, toolCount: tools.length, tools };
  const sources = metadataSources(result?.sources);
  if (sources.length) metadata.sources = sources;
  return metadata;
}
