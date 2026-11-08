'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../travel/ui';
import type { ChatSearchItem } from '../../../lib/chat/contracts';
import { isUuid } from '../../../lib/chat/contracts';
import { api } from './api';
import { readList, readText } from './values';

export type SearchLanding = { type: 'space'; id: string } | { type: 'chat'; spaceId: string; threadId: string };

type LocalItem = { id: string; title: string };

type Props = {
  /** `account` searches the whole workspace; `space` keeps hits for one space. */
  scope: 'account' | 'space';
  spaceId?: string;
  /** Already-loaded rows, used as the local fallback when search is unavailable. */
  localItems: LocalItem[];
  onOpen: (landing: SearchLanding) => void;
};

type Hit = { key: string; label: string; title: string; snippet: string | null; landing: SearchLanding | null };

type ViewState = 'idle' | 'loading' | 'ready' | 'unavailable';

function toSearchItem(raw: unknown): ChatSearchItem | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const type = readText(record.type);
  const id = readText(record.id);
  const title = readText(record.title);
  if ((type !== 'space' && type !== 'chat') || !id || !title) return null;
  return {
    type,
    id,
    title,
    spaceId: readText(record.spaceId),
    threadId: readText(record.threadId),
    snippet: readText(record.snippet),
  };
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const nodes: Array<string | { hit: string; index: number }> = [];
  let cursor = 0;
  let found = lower.indexOf(target);
  while (found !== -1 && cursor < text.length) {
    if (found > cursor) nodes.push(text.slice(cursor, found));
    nodes.push({ hit: text.slice(found, found + target.length), index: found });
    cursor = found + target.length;
    found = lower.indexOf(target, cursor);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return (
    <>
      {nodes.map((node, index) =>
        typeof node === 'string' ? <span key={index}>{node}</span> : <mark key={index}>{node.hit}</mark>,
      )}
    </>
  );
}

/**
 * Search box shared by the space list and the chat list.
 *
 * Calls GET /api/spaces/search; when the endpoint is missing or broken it falls
 * back to filtering the already-loaded rows and shows an "unavailable" notice
 * instead of failing.
 */
export function SearchPanel({ scope, spaceId, localItems, onOpen }: Props) {
  const { t } = useApp();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ChatSearchItem[]>([]);
  const [state, setState] = useState<ViewState>('idle');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      setState('idle');
      setItems([]);
      return;
    }
    const own = ++generation.current;
    const controller = new AbortController();
    setState('loading');
    const timer = window.setTimeout(async () => {
      const result = await api<{ query?: string; items?: unknown[] }>(
        `/api/spaces/search?q=${encodeURIComponent(trimmed.slice(0, 80))}&limit=20`,
        { signal: controller.signal },
      );
      if (generation.current !== own) return;
      if (result.ok) {
        const list = readList(result.data.items) ?? [];
        setItems(list.map(toSearchItem).filter((item): item is ChatSearchItem => item !== null));
        setState('ready');
      } else {
        setItems([]);
        setState('unavailable');
      }
    }, 220);
    return () => {
      generation.current += 1;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed, attempt]);

  const scoped = items.filter((item) => {
    if (scope === 'account') return true;
    return item.type === 'chat' && item.spaceId === spaceId;
  });

  const serverHits: Hit[] = scoped.map((item, index) => ({
    key: `server-${item.type}-${item.id}-${index}`,
    label: item.type === 'space' ? t('Space', '空間') : t('Chat', '對話'),
    title: item.title,
    snippet: item.snippet,
    landing:
      item.type === 'space'
        ? isUuid(item.id)
          ? { type: 'space' as const, id: item.id }
          : null
        : item.spaceId && isUuid(item.spaceId) && isUuid(item.threadId ?? item.id)
          ? { type: 'chat' as const, spaceId: item.spaceId, threadId: (item.threadId ?? item.id) as string }
          : null,
  }));

  const localHits: Hit[] = localItems
    .filter((item) => item.title.toLowerCase().includes(trimmed.toLowerCase()))
    .slice(0, 10)
    .map((item, index) => ({
      key: `local-${item.id}-${index}`,
      label: scope === 'space' ? t('Chat', '對話') : t('Space', '空間'),
      title: item.title,
      snippet: null,
      landing:
        scope === 'space' && spaceId && isUuid(spaceId) && isUuid(item.id)
          ? ({ type: 'chat' as const, spaceId, threadId: item.id } satisfies SearchLanding)
          : scope === 'account' && isUuid(item.id)
            ? ({ type: 'space' as const, id: item.id } satisfies SearchLanding)
            : null,
    }));

  const hits = state === 'ready' ? serverHits : state === 'unavailable' ? localHits : [];
  const showHint = trimmed.length > 0;
  const placeholder =
    scope === 'space'
      ? t('Search chats in this space', '搜尋此空間的對話')
      : t('Search spaces and chats', '搜尋空間及對話');

  return (
    <form
      className="sp-search"
      role="search"
      aria-label={placeholder}
      onSubmit={(event: FormEvent) => event.preventDefault()}
      data-testid={scope === 'space' ? 'space-search' : 'spaces-search'}
    >
      <label className="sp-visually-hidden" htmlFor={`sp-search-${scope}`}>
        {placeholder}
      </label>
      <div className="sp-search-field">
        <input
          id={`sp-search-${scope}`}
          type="search"
          value={query}
          maxLength={80}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="sp-search-clear"
            aria-label={t('Clear search', '清除搜尋')}
            onClick={() => setQuery('')}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      {showHint && (
        <p className="sp-search-status" role="status" aria-live="polite">
          {state === 'loading' && t('Searching…', '正在搜尋…')}
          {state === 'ready' && hits.length === 0 && t('No matches', '沒有相符結果')}
          {state === 'unavailable' && (
            <>
              {t(
                'Search is unavailable right now. Showing matches from this list.',
                '搜尋暫時未能使用，只顯示此清單中的相符項目。',
              )}{' '}
              <button type="button" className="sp-link-button" onClick={() => setAttempt((value) => value + 1)}>
                {t('Retry search', '重試搜尋')}
              </button>
            </>
          )}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="sp-search-results" aria-label={t('Search results', '搜尋結果')}>
          {hits.map((hit) => (
            <li key={hit.key}>
              {hit.landing ? (
                <button
                  type="button"
                  className="sp-search-hit"
                  onClick={() => hit.landing && onOpen(hit.landing)}
                  data-testid="search-result"
                >
                  <span className="sp-search-type">{hit.label}</span>
                  <span className="sp-search-title">
                    <Highlight text={hit.title} query={trimmed} />
                  </span>
                  {hit.snippet && (
                    <span className="sp-search-snippet">
                      <Highlight text={hit.snippet} query={trimmed} />
                    </span>
                  )}
                </button>
              ) : (
                <div className="sp-search-hit" data-static="true">
                  <span className="sp-search-type">{hit.label}</span>
                  <span className="sp-search-title">
                    <Highlight text={hit.title} query={trimmed} />
                  </span>
                  {hit.snippet && (
                    <span className="sp-search-snippet">
                      <Highlight text={hit.snippet} query={trimmed} />
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
