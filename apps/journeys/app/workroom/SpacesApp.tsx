'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useApp } from '../travel/ui';
import { isUuid } from '../../lib/chat/contracts';
import type { ChatMessage, ChatSpace, ChatThread, ChatThreadDetail } from '../../lib/chat/contracts';
import './spaces.css';

type Props = { path: string; actorId: string | null; enabled: boolean };

type ToolChip = { id: string; name: string; status: 'running' | 'done' | 'error'; summary?: string };

type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; requestId?: string };

async function api<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(input, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as ApiResult<T> | null;
    if (payload) return payload;
    return { ok: false, code: response.status === 401 ? 'AUTH_REQUIRED' : 'UNAVAILABLE' };
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

function errorText(code: string, locale: 'en' | 'zh-HK'): string {
  const zh: Record<string, string> = {
    AUTH_REQUIRED: '請先登入才能使用你的空間。',
    NOT_FOUND: '找不到這個空間或對話。',
    UNAVAILABLE: '私人服務暫時未能接通，請稍後再試。',
    INVALID: '輸入未獲接納，請修正後再試。',
    CONFLICT: '相同的請求內容不一致，請重新載入後再試。',
  };
  const en: Record<string, string> = {
    AUTH_REQUIRED: 'Sign in to use your spaces.',
    NOT_FOUND: 'That space or chat was not found.',
    UNAVAILABLE: 'The private service is unavailable right now. Try again shortly.',
    INVALID: 'The input was rejected. Correct it and try again.',
    CONFLICT: 'The same request id carried different content. Reload and retry.',
  };
  return (locale === 'zh-HK' ? zh : en)[code] ?? (locale === 'zh-HK' ? '未能完成請求。' : 'The request could not be completed.');
}

export function SpacesApp({ path, actorId, enabled }: Props) {
  const { t, href, locale } = useApp();
  const segments = path.split('/').filter(Boolean);
  const spaceId = segments[1] && isUuid(segments[1]) ? segments[1] : null;
  const threadId = segments[3] && isUuid(segments[3]) ? segments[3] : null;

  if (!actorId) {
    return (
      <section className="sp-empty">
        <h1>{t('Spaces', '空間')}</h1>
        <p>{t('Sign in to open your spaces and continuous chats.', '登入後即可開啟你的空間及連續對話。')}</p>
        <Link className="k-btn primary" href={`/${locale}/sign-in?next=${encodeURIComponent(href('spaces'))}`}>
          {t('Sign in', '登入')}
        </Link>
      </section>
    );
  }
  if (!enabled) {
    return (
      <section className="sp-empty">
        <h1>{t('Spaces', '空間')}</h1>
        <p role="status">{t('Private spaces are not connected yet.', '私人空間服務尚未接通。')}</p>
      </section>
    );
  }
  if (threadId && spaceId) return <ChatView spaceId={spaceId} threadId={threadId} />;
  if (spaceId) return <SpaceView spaceId={spaceId} />;
  return <SpaceList />;
}

function SpaceList() {
  const { t, href } = useApp();
  const [spaces, setSpaces] = useState<ChatSpace[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ items: ChatSpace[] }>('/api/spaces');
    if (result.ok) setSpaces(result.data.items);
    else setError(result.code);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    const result = await api<ChatSpace>('/api/spaces', {
      method: 'POST',
      body: JSON.stringify({ id: crypto.randomUUID(), name: name.trim() }),
    });
    setBusy(false);
    if (result.ok) {
      setName('');
      await load();
    } else setError(result.code);
  }

  return (
    <div className="sp-page">
      <header className="sp-head">
        <h1>{t('Spaces', '空間')}</h1>
        <p>{t('A space groups continuous conversations. Each chat keeps its own thread and tool history.', '空間用來分組連續對話；每個對話保留自己的訊息及工具紀錄。')}</p>
      </header>
      <form className="sp-create" onSubmit={create}>
        <label>
          {t('New space name', '新空間名稱')}
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t('e.g. Kyoto trip planning', '例如：京都行程規劃')} />
        </label>
        <button className="k-btn primary" disabled={busy || !name.trim()}>{t('Create space', '建立空間')}</button>
      </form>
      {error && <p role="alert" className="sp-error">{errorText(error, 'zh-HK')}</p>}
      {spaces === null && <p role="status">{t('Loading spaces…', '正在載入空間…')}</p>}
      {spaces?.length === 0 && <p className="sp-muted">{t('No spaces yet. Create one to start a conversation.', '尚未有空間，建立一個即可開始對話。')}</p>}
      <ul className="sp-list">
        {spaces?.map((space) => (
          <li key={space.id}>
            <Link href={href(`spaces/${space.id}`)}>
              <strong>{space.name}</strong>
              <span>{space.threadCount} {t('chats', '個對話')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpaceView({ spaceId }: { spaceId: string }) {
  const { t, href } = useApp();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ items: ChatThread[] }>(`/api/spaces/${spaceId}/chats`);
    if (result.ok) setThreads(result.data.items);
    else setError(result.code);
  }, [spaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function newChat() {
    if (busy) return;
    setBusy(true);
    const result = await api<ChatThread>(`/api/spaces/${spaceId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ id: crypto.randomUUID() }),
    });
    setBusy(false);
    if (result.ok) window.location.assign(href(`spaces/${spaceId}/chat/${result.data.id}`));
    else setError(result.code);
  }

  async function remove(threadIdToRemove: string) {
    if (busy) return;
    setBusy(true);
    const result = await api(`/api/spaces/${spaceId}/chats/${threadIdToRemove}`, { method: 'DELETE' });
    setBusy(false);
    if (result.ok) await load();
    else setError(result.code);
  }

  return (
    <div className="sp-page">
      <nav className="sp-breadcrumb">
        <Link href={href('spaces')}>{t('Spaces', '空間')}</Link>
      </nav>
      <header className="sp-head sp-head-row">
        <h1>{t('Chats', '對話')}</h1>
        <button className="k-btn primary" onClick={() => void newChat()} disabled={busy}>{t('New chat', '新對話')}</button>
      </header>
      {error && <p role="alert" className="sp-error">{errorText(error, 'zh-HK')}</p>}
      {threads === null && <p role="status">{t('Loading chats…', '正在載入對話…')}</p>}
      {threads?.length === 0 && <p className="sp-muted">{t('No chats yet. Start one.', '尚未有對話，開始第一個。')}</p>}
      <ul className="sp-list">
        {threads?.map((thread) => (
          <li key={thread.id}>
            <Link href={href(`spaces/${spaceId}/chat/${thread.id}`)}>
              <strong>{thread.title}</strong>
              <span>{thread.messageCount} {t('messages', '則訊息')}</span>
            </Link>
            <button className="sp-delete" aria-label={t('Delete chat', '刪除對話')} onClick={() => void remove(thread.id)} disabled={busy}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatView({ spaceId, threadId }: { spaceId: string; threadId: string }) {
  const { t, href, locale } = useApp();
  const [thread, setThread] = useState<ChatThreadDetail | null>(null);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState('');
  const [tools, setTools] = useState<ToolChip[]>([]);
  const [mcp, setMcp] = useState<{ protocolVersion: string; server: { name: string; version: string }; tools: string[] } | null>(null);
  const [model, setModel] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const result = await api<ChatThreadDetail>(`/api/spaces/${spaceId}/chats/${threadId}`);
    if (result.ok) {
      setThread(result.data);
      if (result.data.model) setModel(result.data.model);
      setError('');
    } else setError(result.code);
  }, [spaceId, threadId]);
  useEffect(() => {
    void load();
  }, [load]);

  // Real MCP handshake on mount, so the surface shows which server/tools back the chat.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const init = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'kinnsoos-spaces-ui', version: '1.0.0' } } }),
        }).then((r) => r.json());
        const listed = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
        }).then((r) => r.json());
        if (!active) return;
        const info = init?.result?.serverInfo;
        if (info) {
          setMcp({
            protocolVersion: String(init.result.protocolVersion ?? ''),
            server: { name: String(info.name ?? ''), version: String(info.version ?? '') },
            tools: (listed?.result?.tools ?? []).map((tool: { name: string }) => tool.name),
          });
        }
      } catch {
        /* the first turn reports handshake failures */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [thread, live, tools.length]);

  const messages = useMemo<ChatMessage[]>(() => thread?.messages ?? [], [thread]);

  async function sendText() {
    const text = question.trim();
    if (!text || streaming) return;
    setStreaming(true);
    setLive('');
    setTools([]);
    setError('');
    setQuestion('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/spaces/${spaceId}/chats/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, requestId: crypto.randomUUID(), locale }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { code?: string } | null;
        setError(payload?.code ?? (response.status === 401 ? 'AUTH_REQUIRED' : 'UNAVAILABLE'));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((row) => row.startsWith('data: '));
          if (!line) continue;
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (payload.type === 'delta' && typeof payload.text === 'string') setLive((current) => current + payload.text);
          else if (payload.type === 'tool' && typeof payload.name === 'string') {
            const chip: ToolChip = {
              id: String(payload.id ?? payload.name),
              name: payload.name,
              status: (payload.status as ToolChip['status']) ?? 'running',
              summary: typeof payload.summary === 'string' ? payload.summary : undefined,
            };
            setTools((current) => {
              const next = current.filter((item) => item.id !== chip.id);
              return [...next, chip];
            });
          } else if (payload.type === 'mcp') {
            setMcp({
              protocolVersion: String(payload.protocolVersion ?? ''),
              server: (payload.server as { name: string; version: string }) ?? { name: '', version: '' },
              tools: Array.isArray(payload.tools) ? (payload.tools as string[]) : [],
            });
          } else if (payload.type === 'done' && typeof payload.model === 'string') setModel(payload.model);
          else if (payload.type === 'error') setError('UNAVAILABLE');
        }
      }
    } catch {
      setError('UNAVAILABLE');
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setLive('');
      setTools([]);
      await load();
    }
  }

  return (
    <div className="sp-page sp-chat">
      <nav className="sp-breadcrumb">
        <Link href={href('spaces')}>{t('Spaces', '空間')}</Link>
        <span>/</span>
        <Link href={href(`spaces/${spaceId}`)}>{t('Chats', '對話')}</Link>
      </nav>
      <header className="sp-head sp-head-row">
        <h1>{thread?.title ?? t('Chat', '對話')}</h1>
        <span className="sp-meta">
          {mcp ? `MCP ${mcp.protocolVersion} · ${mcp.server.name}` : t('connecting MCP…', '正在連接 MCP…')}
          {model ? ` · ${model}` : ''}
        </span>
      </header>
      {error && <p role="alert" className="sp-error">{errorText(error, 'zh-HK')}</p>}

      <ol className="sp-transcript" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id} className={`sp-msg sp-msg-${message.role}`}>
            <span className="sp-role">{message.role === 'user' ? t('You', '你') : t('Assistant', '助理')}</span>
            <p>{message.body}</p>
            {Array.isArray((message.toolPayload as { tools?: unknown }).tools) && (
              <ul className="sp-tool-list">
                {((message.toolPayload as { tools: Array<{ name: string; ok: boolean; summary?: string }> }).tools ?? []).map((tool, index) => (
                  <li key={`${tool.name}-${index}`} data-ok={tool.ok}>{tool.name}{tool.summary ? ` · ${tool.summary}` : ''}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {tools.length > 0 && (
          <li className="sp-tool-live">
            {tools.map((tool) => (
              <span key={tool.id} className="sp-chip" data-status={tool.status}>{tool.name}{tool.status === 'running' ? '…' : ''}</span>
            ))}
          </li>
        )}
        {live && (
          <li className="sp-msg sp-msg-assistant sp-live">
            <span className="sp-role">{t('Assistant', '助理')}</span>
            <p>{live}</p>
          </li>
        )}
        {streaming && !live && tools.length === 0 && <li className="sp-thinking">{t('Thinking…', '正在整理…')}</li>}
        <div ref={bottomRef} />
      </ol>

      <form className="sp-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void sendText(); }}>
        <label className="sp-visually-hidden" htmlFor="sp-question">{t('Your message', '你的訊息')}</label>
        <textarea
          id="sp-question"
          rows={2}
          maxLength={8000}
          value={question}
          disabled={streaming}
          placeholder={t('Ask about guides, your trips, or this workspace…', '詢問攻略、你的行程或這個工作區⋯')}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendText();
            }
          }}
        />
        <button className="k-btn primary" disabled={streaming || !question.trim()}>
          {streaming ? t('Replying…', '回覆中⋯') : t('Send', '傳送')}
        </button>
      </form>
      <p className="sp-note">
        {t('Read-only tools. The assistant cannot publish, book, pay or message anyone.', '只讀工具；助理不能發佈、預訂、付款或發送訊息。')}
      </p>
    </div>
  );
}
