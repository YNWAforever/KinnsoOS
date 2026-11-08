'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useApp } from '../../travel/ui';
import type { ChatMessage, ChatThreadDetail } from '../../../lib/chat/contracts';
import { AiNotice } from './AiNotice';
import { api, errorText, rateLimitFrom } from './api';
import type { RateLimit } from './api';
import { formatResetAt, motionAllowed, randomId } from './format';
import { InterruptedBubble, LiveBubble, MessageBubble } from './MessageBubble';
import type { InterruptedReply } from './MessageBubble';
import { RowActions } from './RowActions';
import type { RowActionResult } from './RowActions';
import { UsageMeter } from './UsageMeter';
import { parseSourceList } from './toolResults';
import type { LiveTool, SourceCard } from './toolResults';
import { readRecord, readText } from './values';

type McpState = { state: 'connecting' | 'ready' | 'unavailable'; protocolVersion: string; name: string };

/** One SSE frame -> JSON object (multi-line `data:` frames are joined). */
function parseSseFrame(frame: string): Record<string, unknown> | null {
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0) return null;
  try {
    return readRecord(JSON.parse(data.join('\n')));
  } catch {
    return null;
  }
}

function readLiveTools(payload: Record<string, unknown>, index: number): LiveTool | null {
  const name = readText(payload.name);
  if (!name) return null;
  const id = readText(payload.id) ?? name;
  const statusText = readText(payload.status);
  const status: LiveTool['status'] = statusText === 'done' ? 'done' : statusText === 'error' ? 'error' : 'running';
  const sources = parseSourceList(payload.sources);
  const tool: LiveTool = { id: id || `tool-${index}`, name, status };
  const summary = readText(payload.summary);
  if (summary) tool.summary = summary;
  if (sources.length > 0) tool.sources = sources;
  return tool;
}

/**
 * One continuous chat: streaming reply with stop/regenerate/retry, source cards,
 * per-message metadata, the usage meter and the AI notice above the composer.
 */
export function ChatView({ spaceId, threadId, actorId }: { spaceId: string; threadId: string; actorId: string | null }) {
  const { t, href, locale } = useApp();
  const router = useRouter();
  const [thread, setThread] = useState<ChatThreadDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'unavailable'>('loading');
  const [loadError, setLoadError] = useState('');
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [live, setLive] = useState('');
  const [liveTools, setLiveTools] = useState<LiveTool[]>([]);
  const [liveSources, setLiveSources] = useState<SourceCard[]>([]);
  const [interruptions, setInterruptions] = useState<InterruptedReply[]>([]);
  const [sendError, setSendError] = useState('');
  const [sendErrorFallback, setSendErrorFallback] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null);
  const [clock, setClock] = useState(0);
  const [mcp, setMcp] = useState<McpState>({ state: 'connecting', protocolVersion: '', name: '' });
  const [model, setModel] = useState('');
  const [usageRefresh, setUsageRefresh] = useState(0);

  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef('');
  /** Text of the most recent non-regenerate attempt, for a correct Retry action. */
  const pendingTextRef = useRef('');
  const bottomRef = useRef<HTMLLIElement | null>(null);
  const nearBottomRef = useRef(true);
  const lastScrollAt = useRef(0);

  const load = useCallback(async () => {
    const result = await api<ChatThreadDetail>(`/api/spaces/${spaceId}/chats/${threadId}`);
    if (result.ok) {
      setThread(result.data);
      setStatus('ready');
      setLoadError('');
      const nextModel = readText(result.data.model);
      if (nextModel) setModel(nextModel);
      return;
    }
    setLoadError(result.code);
    setStatus(result.status === 404 && !result.unavailable ? 'missing' : 'unavailable');
  }, [spaceId, threadId]);

  useEffect(() => {
    setStatus('loading');
    void load();
  }, [load]);

  // Real MCP handshake on mount, so the surface shows which server/tools back the chat.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const initResponse = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'kinnsoos-spaces-ui', version: '1.0.0' },
            },
          }),
        });
        if (!initResponse.ok) throw new Error('mcp');
        const init = readRecord(await initResponse.json().catch(() => null));
        const result = readRecord(init?.result);
        const serverInfo = readRecord(result?.serverInfo);
        const name = readText(serverInfo?.name);
        if (!active) return;
        if (name) {
          setMcp({ state: 'ready', protocolVersion: readText(result?.protocolVersion) ?? '', name });
        } else {
          setMcp({ state: 'unavailable', protocolVersion: '', name: '' });
        }
      } catch {
        if (active) setMcp({ state: 'unavailable', protocolVersion: '', name: '' });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      nearBottomRef.current =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 280;
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const messages = useMemo<ChatMessage[]>(() => thread?.messages ?? [], [thread]);

  useEffect(() => {
    if (!nearBottomRef.current) return;
    const now = Date.now();
    if (now - lastScrollAt.current < 120) return;
    lastScrollAt.current = now;
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: motionAllowed() ? 'smooth' : 'auto' });
  }, [messages, live, liveTools.length, interruptions.length]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // Escape stops an in-flight generation from anywhere on the surface.
  useEffect(() => {
    if (!streaming) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      stopGeneration();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [streaming, stopGeneration]);

  // Keep the "limit reached" state fresh so the composer re-enables by itself.
  useEffect(() => {
    setClock(Date.now());
  }, []);
  useEffect(() => {
    if (!rateLimit) return;
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [rateLimit]);
  // Drop the limit state once its reset instant has passed (fallback: 10 min).
  useEffect(() => {
    if (!rateLimit) return;
    const reset = rateLimit.resetAt ? new Date(rateLimit.resetAt).getTime() : Number.NaN;
    const wait = Number.isFinite(reset) ? Math.max(1000, reset - Date.now() + 1000) : 600000;
    const timer = window.setTimeout(() => setRateLimit(null), wait);
    return () => window.clearTimeout(timer);
  }, [rateLimit]);

  const lastUser = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') return messages[index];
    }
    return null;
  }, [messages]);
  const canRegenerate = messages.length > 0 && lastUser !== null && !streaming;
  const resetMs = rateLimit?.resetAt ? new Date(rateLimit.resetAt).getTime() : Number.NaN;
  const rateLimitedNow = Boolean(rateLimit) && Number.isFinite(resetMs) && resetMs > clock;

  const pushInterrupted = useCallback((text: string, reason: 'stopped' | 'error') => {
    setInterruptions((current) => [...current, { id: randomId(), text, reason }].slice(-3));
  }, []);

  async function send(options: { regenerate?: boolean; text?: string } = {}) {
    if (streamingRef.current) return;
    const regenerate = options.regenerate === true;
    const text = (options.text ?? question).trim();
    if (!regenerate && !text) return;
    if (!regenerate && rateLimitedNow) return;
    if (regenerate && !lastUser) {
      setSendError('INVALID');
      setSendErrorFallback(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    setRegenerating(regenerate);
    setLive('');
    liveRef.current = '';
    setLiveTools([]);
    setLiveSources([]);
    setSendError('');
    setSendErrorFallback(false);
    if (regenerate) {
      pendingTextRef.current = lastUser?.body ?? '';
    } else {
      pendingTextRef.current = text;
      setQuestion('');
    }
    let turnFailed = false;

    try {
      const response = await fetch(`/api/spaces/${spaceId}/chats/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          regenerate
            ? { regenerate: true, requestId: randomId(), locale }
            : { body: text, requestId: randomId(), locale },
        ),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        turnFailed = true;
        const payload = readRecord(await response.json().catch(() => null));
        const code =
          readText(payload?.code) ??
          (response.status === 429
            ? 'RATE_LIMITED'
            : response.status === 401
              ? 'AUTH_REQUIRED'
              : response.status === 404
                ? 'NOT_FOUND'
                : 'UNAVAILABLE');
        if (code === 'RATE_LIMITED') {
          setRateLimit(rateLimitFrom(payload));
          if (!regenerate) setQuestion((current) => current || text);
          return;
        }
        if (regenerate && code === 'INVALID') {
          // Older servers reject {regenerate:true}: refill the composer so the
          // same question can be sent again in one click.
          setSendErrorFallback(true);
          if (lastUser) setQuestion(lastUser.body);
          setSendError('REGENERATE_UNAVAILABLE');
          return;
        }
        if (!regenerate) setQuestion((current) => current || text);
        setSendError(code);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      let failed = false;

      const handleFrame = (frame: string) => {
        const payload = parseSseFrame(frame);
        if (!payload) return;
        const type = readText(payload.type);
        if (type === 'delta') {
          if (typeof payload.text !== 'string' || payload.text.length === 0) return;
          liveRef.current += payload.text;
          setLive(liveRef.current);
          return;
        }
        if (type === 'tool') {
          const tool = readLiveTools(payload, liveTools.length);
          if (!tool) return;
          if (tool.sources && tool.sources.length > 0) {
            const incoming = tool.sources;
            setLiveSources((current) => {
              const seen = new Set(current.map((card) => card.key));
              const next = [...current];
              for (const card of incoming) {
                if (!seen.has(card.key)) {
                  seen.add(card.key);
                  next.push(card);
                }
              }
              return next.slice(0, 12);
            });
          }
          setLiveTools((current) => {
            const found = current.some((item) => item.id === tool.id);
            if (!found) return [...current, tool];
            return current.map((item) =>
              item.id === tool.id
                ? { ...item, status: tool.status, summary: tool.summary ?? item.summary, sources: tool.sources ?? item.sources }
                : item,
            );
          });
          return;
        }
        if (type === 'mcp') {
          const server = readRecord(payload.server);
          setMcp({
            state: 'ready',
            protocolVersion: readText(payload.protocolVersion) ?? '',
            name: readText(server?.name) ?? '',
          });
          return;
        }
        if (type === 'final') {
          const sources: SourceCard[] = parseSourceList(payload.sources);
          if (sources.length > 0) {
            setLiveSources((current) => {
              const seen = new Set(current.map((card) => card.key));
              const next = [...current];
              for (const card of sources) {
                if (!seen.has(card.key)) {
                  seen.add(card.key);
                  next.push(card);
                }
              }
              return next.slice(0, 12);
            });
          }
          return;
        }
        if (type === 'done') {
          completed = true;
          const doneModel = readText(payload.model);
          if (doneModel) setModel(doneModel);
          return;
        }
        if (type === 'error') {
          failed = true;
          turnFailed = true;
          if (liveRef.current.trim()) pushInterrupted(liveRef.current, 'error');
          const code = readText(payload.code) ?? 'TURN_FAILED';
          setSendError(code === 'TURN_FAILED' ? 'UNAVAILABLE' : code);
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) handleFrame(frame);
        if (failed) break;
      }
      if (buffer.trim()) handleFrame(buffer);

      if (!completed && !failed) {
        turnFailed = true;
        if (liveRef.current.trim()) pushInterrupted(liveRef.current, 'error');
        else setSendError('UNAVAILABLE');
      }
    } catch (error) {
      turnFailed = true;
      const aborted =
        controller.signal.aborted ||
        (error !== null && typeof error === 'object' && readText((error as { name?: unknown }).name) === 'AbortError');
      if (aborted) {
        // Stopped by the visitor: keep whatever text arrived, clearly labelled.
        pushInterrupted(liveRef.current, 'stopped');
      } else {
        if (!regenerate) setQuestion((current) => current || text);
        if (liveRef.current.trim()) pushInterrupted(liveRef.current, 'error');
        setSendError('UNAVAILABLE');
      }
    } finally {
      abortRef.current = null;
      streamingRef.current = false;
      setStreaming(false);
      setRegenerating(false);
      setLive('');
      liveRef.current = '';
      setLiveTools([]);
      setLiveSources([]);
      await load();
      // A completed turn supersedes any earlier interrupted partials.
      if (!turnFailed) setInterruptions([]);
      setUsageRefresh((value) => value + 1);
    }
  }

  function retry() {
    if (sendError === 'RATE_LIMITED' && rateLimitedNow) return;
    setSendError('');
    const fallback = sendErrorFallback;
    setSendErrorFallback(false);
    const attempted = pendingTextRef.current.trim();
    if (fallback) {
      // Regenerate is unsupported: send the question as a fresh message instead.
      const again = (attempted || question.trim() || lastUser?.body || '').trim();
      if (again) void send({ text: again });
      return;
    }
    const storedAsUserMessage = lastUser !== null && attempted !== '' && lastUser.body.trim() === attempted;
    // If the failed attempt is already the last persisted user message, the only
    // missing piece is the reply: re-answer it. Otherwise send the text again.
    if (storedAsUserMessage) {
      void send({ regenerate: true });
      return;
    }
    if (attempted) {
      void send({ text: attempted });
      return;
    }
    void send({ regenerate: true });
  }

  async function renameChat(title: string): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}/chats/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    if (result.ok) {
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function archiveChat(archived: boolean): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}/chats/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    });
    if (result.ok) {
      router.push(href(`spaces/${spaceId}`));
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function deleteChat(): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}/chats/${threadId}`, { method: 'DELETE' });
    if (result.ok) {
      router.push(href(`spaces/${spaceId}`));
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  if (!thread && status === 'loading') {
    return (
      <div className="sp-page sp-chat">
        <p role="status">{t('Loading chat…', '正在載入對話…')}</p>
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="sp-page sp-chat sp-empty">
        <h1>{t('Chat', '對話')}</h1>
        <p role="alert" className="sp-error">
          {errorText(status === 'missing' ? 'NOT_FOUND' : loadError || 'UNAVAILABLE', locale)}
        </p>
        {status === 'unavailable' && (
          <button
            type="button"
            className="k-btn"
            onClick={() => {
              setStatus('loading');
              void load();
            }}
          >
            {t('Retry', '重試')}
          </button>
        )}
        <Link className="k-btn" href={href('spaces')}>
          {t('Back to spaces', '返回空間')}
        </Link>
      </div>
    );
  }

  const resetText = formatResetAt(rateLimit?.resetAt, locale);
  const rateLimitText = rateLimit
    ? t(
        `Hourly reply limit reached${rateLimit.limit !== null ? ` (${rateLimit.limit} per hour)` : ''}.${
          resetText ? ` It resets at ${resetText}.` : ' Try again later.'
        }`,
        `已達到每小時回覆上限${rateLimit.limit !== null ? `（每小時 ${rateLimit.limit} 次）` : ''}。${
          resetText ? `將於 ${resetText} 重設。` : '請稍後再試。'
        }`,
      )
    : '';

  return (
    <div className="sp-page sp-chat">
      <nav className="sp-breadcrumb" aria-label={t('Breadcrumb', '路徑')}>
        <Link href={href('spaces')}>{t('Spaces', '空間')}</Link>
        <span aria-hidden="true">/</span>
        <Link href={href(`spaces/${spaceId}`)}>{t('Chats', '對話')}</Link>
      </nav>
      <header className="sp-head sp-head-row">
        <div className="sp-head-main">
          <h1>{thread.title}</h1>
          <p className="sp-meta">
            {mcp.state === 'ready'
              ? `MCP ${mcp.protocolVersion}${mcp.name ? ` · ${mcp.name}` : ''}`
              : mcp.state === 'connecting'
                ? t('Connecting MCP…', '正在連接 MCP…')
                : t('MCP unavailable', 'MCP 未能連接')}
            {model ? ` · ${model}` : ''}
          </p>
        </div>
        <div className="sp-head-actions">
          <UsageMeter refreshKey={usageRefresh} rateLimit={rateLimit} />
          <RowActions
            kind="chat"
            name={thread.title}
            archived={Boolean(thread.archivedAt)}
            busy={streaming}
            onRename={renameChat}
            onArchived={archiveChat}
            onDelete={deleteChat}
          />
        </div>
      </header>

      {sendError && (
        <div className="sp-banner" role="alert" data-testid="chat-error">
          <p>{errorText(sendError, locale)}</p>
          <button
            type="button"
            className="k-btn"
            onClick={retry}
            disabled={streaming || (sendError === 'RATE_LIMITED' && rateLimitedNow)}
            data-testid="retry-reply"
          >
            {sendErrorFallback ? t('Send again', '再次傳送') : t('Retry', '重試')}
          </button>
        </div>
      )}
      {rateLimit && (
        <div className="sp-banner sp-banner-limit" role="alert" data-testid="rate-limit-banner">
          <p>{rateLimitText}</p>
        </div>
      )}
      {loadError && (
        <p className="sp-error" role="alert">
          {errorText(loadError, locale)}
        </p>
      )}

      <ol className="sp-transcript" aria-label={t('Conversation', '對話')}>
        {messages.length === 0 && interruptions.length === 0 && !streaming && (
          <li className="sp-muted sp-empty-transcript">
            {t('No messages yet. Ask the first question below.', '尚未有訊息，可在下方問第一個問題。')}
          </li>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id || `m-${message.sequence}`} message={message} />
        ))}
        {interruptions.map((reply) => (
          <InterruptedBubble key={reply.id} reply={reply} busy={streaming} onRetry={() => void send({ regenerate: true })} />
        ))}
        {streaming && <LiveBubble text={live} tools={liveTools} sources={liveSources} />}
        <li ref={bottomRef} className="sp-scroll-anchor" aria-hidden="true" />
      </ol>

      {(canRegenerate || streaming) && (
        <div className="sp-toolbar">
          {canRegenerate && (
            <button
              type="button"
              className="k-btn sp-secondary"
              onClick={() => void send({ regenerate: true })}
              data-testid="regenerate-reply"
            >
              {t('Regenerate last reply', '重新生成最後回覆')}
            </button>
          )}
          {streaming && (
            <span className="sp-toolbar-status" role="status">
              {regenerating ? t('Regenerating…', '正在重新生成…') : t('Generating…', '正在生成…')}
            </span>
          )}
        </div>
      )}

      <div className="sp-composer-wrap">
        <AiNotice actorId={actorId} />
        <form
          className="sp-composer"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="sp-visually-hidden" htmlFor="sp-question">
            {t('Your message', '你的訊息')}
          </label>
          <textarea
            id="sp-question"
            rows={2}
            maxLength={8000}
            value={question}
            placeholder={t('Ask about guides, your trips, or this workspace…', '詢問攻略、你的行程或這個工作區⋯')}
            aria-describedby="sp-composer-hint"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (!streamingRef.current) void send();
              }
            }}
          />
          <div className="sp-composer-actions">
            {streaming ? (
              <button type="button" className="k-btn sp-stop" onClick={stopGeneration} data-testid="stop-generation">
                {t('Stop', '停止')}
              </button>
            ) : (
              <button
                type="submit"
                className="k-btn primary"
                disabled={!question.trim() || rateLimitedNow}
                data-testid="send-message"
              >
                {t('Send', '傳送')}
              </button>
            )}
          </div>
        </form>
        <p className="sp-note" id="sp-composer-hint">
          {t(
            'Enter sends · Shift+Enter adds a line · Esc stops a reply',
            'Enter 傳送 · Shift+Enter 換行 · Esc 停止回覆',
          )}
        </p>
        <p className="sp-note">
          {t(
            'Read-only tools. The assistant cannot publish, book, pay or message anyone.',
            '只讀工具；助理不能發佈、預訂、付款或發送訊息。',
          )}
        </p>
      </div>
    </div>
  );
}
