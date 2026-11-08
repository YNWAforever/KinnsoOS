'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../travel/ui';
import { isUuid } from '../../lib/chat/contracts';
import type { ChatSpace, ChatThread } from '../../lib/chat/contracts';
import './spaces.css';
import { api, errorText } from './space/api';
import { ChatView } from './space/ChatView';
import { randomId } from './space/format';
import { RowActions } from './space/RowActions';
import type { RowActionResult } from './space/RowActions';
import { SearchPanel } from './space/SearchPanel';
import type { SearchLanding } from './space/SearchPanel';
import { UsageMeter } from './space/UsageMeter';
import { readList } from './space/values';

type Props = { path: string; actorId: string | null; enabled: boolean };

function isSpace(value: unknown): value is ChatSpace {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return isUuid(record.id) && typeof record.name === 'string';
}

function isThread(value: unknown): value is ChatThread {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return isUuid(record.id) && isUuid(record.spaceId) && typeof record.title === 'string';
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
  if (threadId && spaceId) return <ChatView spaceId={spaceId} threadId={threadId} actorId={actorId} />;
  if (spaceId) return <SpaceView spaceId={spaceId} />;
  return <SpaceList />;
}

function threadCountLabel(count: number, t: (en: string, zh: string) => string): string {
  if (count === 1) return t('1 chat', '1 個對話');
  return t(`${count} chats`, `${count} 個對話`);
}

function SpaceList() {
  const { t, href, locale } = useApp();
  const router = useRouter();
  const [spaces, setSpaces] = useState<ChatSpace[] | null>(null);
  const [error, setError] = useState('');
  const [errorUnavailable, setErrorUnavailable] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ items: ChatSpace[] }>('/api/spaces');
    if (result.ok) {
      setSpaces((readList(result.data.items) ?? []).filter(isSpace));
      setError('');
      setErrorUnavailable(false);
      return;
    }
    setError(result.code);
    setErrorUnavailable(result.unavailable);
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
      body: JSON.stringify({ id: randomId(), name: name.trim() }),
    });
    setBusy(false);
    if (result.ok) {
      setName('');
      await load();
    } else {
      setError(result.code);
      setErrorUnavailable(result.unavailable);
    }
  }

  async function renameSpace(id: string, next: string): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) });
    if (result.ok) {
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function archiveSpace(id: string): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
    if (result.ok) {
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function deleteSpace(id: string): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${id}`, { method: 'DELETE' });
    if (result.ok) {
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  function openLanding(landing: SearchLanding) {
    router.push(landing.type === 'space' ? href(`spaces/${landing.id}`) : href(`spaces/${landing.spaceId}/chat/${landing.threadId}`));
  }

  return (
    <div className="sp-page">
      <header className="sp-head sp-head-row">
        <div className="sp-head-main">
          <h1>{t('Spaces', '空間')}</h1>
          <p>{t('A space groups continuous conversations. Each chat keeps its own thread and tool history.', '空間用來分組連續對話；每個對話保留自己的訊息及工具紀錄。')}</p>
        </div>
        <UsageMeter />
      </header>
      <SearchPanel
        scope="account"
        localItems={(spaces ?? []).map((space) => ({ id: space.id, title: space.name }))}
        onOpen={openLanding}
      />
      <form className="sp-create" onSubmit={(event) => void create(event)}>
        <label>
          {t('New space name', '新空間名稱')}
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('e.g. Kyoto trip planning', '例如：京都行程規劃')}
          />
        </label>
        <button className="k-btn primary" disabled={busy || !name.trim()}>
          {busy ? t('Creating…', '建立中…') : t('Create space', '建立空間')}
        </button>
      </form>
      {error && (
        <p role="alert" className="sp-error">
          {errorUnavailable
            ? t('Spaces are unavailable right now. Try again shortly.', '空間服務暫時未能使用，請稍後再試。')
            : errorText(error, locale)}
        </p>
      )}
      {spaces === null && !error && <p role="status">{t('Loading spaces…', '正在載入空間…')}</p>}
      {spaces?.length === 0 && (
        <p className="sp-muted">{t('No spaces yet. Create one to start a conversation.', '尚未有空間，建立一個即可開始對話。')}</p>
      )}
      <ul className="sp-list">
        {spaces?.map((space) => (
          <li key={space.id} className="sp-row" data-archived={Boolean(space.archivedAt)}>
            <Link className="sp-row-link" href={href(`spaces/${space.id}`)}>
              <strong>{space.name}</strong>
              <span className="sp-row-meta">
                {space.archivedAt && <span className="sp-badge">{t('Archived', '已封存')}</span>}
                {threadCountLabel(space.threadCount, t)}
              </span>
            </Link>
            <RowActions
              kind="space"
              name={space.name}
              archived={Boolean(space.archivedAt)}
              onRename={(next) => renameSpace(space.id, next)}
              onArchived={() => archiveSpace(space.id)}
              onDelete={() => deleteSpace(space.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpaceView({ spaceId }: { spaceId: string }) {
  const { t, href, locale } = useApp();
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [space, setSpace] = useState<ChatSpace | null>(null);
  const [missingSpace, setMissingSpace] = useState(false);
  const [error, setError] = useState('');
  const [errorUnavailable, setErrorUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [threadResult, spacesResult] = await Promise.all([
      api<{ items: ChatThread[] }>(`/api/spaces/${spaceId}/chats`),
      api<{ items: ChatSpace[] }>('/api/spaces'),
    ]);
    if (threadResult.ok) {
      setThreads((readList(threadResult.data.items) ?? []).filter(isThread));
      setError('');
      setErrorUnavailable(false);
    } else {
      setError(threadResult.code);
      setErrorUnavailable(threadResult.unavailable);
    }
    if (spacesResult.ok) {
      const found = (readList(spacesResult.data.items) ?? []).filter(isSpace).find((item) => item.id === spaceId) ?? null;
      setSpace(found);
      setMissingSpace(!found && threadResult.ok);
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function newChat() {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await api<ChatThread>(`/api/spaces/${spaceId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ id: randomId() }),
    });
    setBusy(false);
    if (result.ok && isUuid(result.data.id)) {
      router.push(href(`spaces/${spaceId}/chat/${result.data.id}`));
      return;
    }
    if (result.ok) setError('UNAVAILABLE');
    else {
      setError(result.code);
      setErrorUnavailable(result.unavailable);
    }
  }

  async function renameThread(id: string, next: string): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}/chats/${id}`, { method: 'PATCH', body: JSON.stringify({ title: next }) });
    if (result.ok) {
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function archiveThread(id: string, archived: boolean): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}/chats/${id}`, { method: 'PATCH', body: JSON.stringify({ archived }) });
    if (result.ok) {
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function deleteThread(id: string): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}/chats/${id}`, { method: 'DELETE' });
    if (result.ok) {
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function renameSpace(next: string): Promise<RowActionResult> {
    const result = await api<ChatSpace>(`/api/spaces/${spaceId}`, { method: 'PATCH', body: JSON.stringify({ name: next }) });
    if (result.ok) {
      setSpace(result.data);
      await load();
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function archiveSpace(): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
    if (result.ok) {
      router.push(href('spaces'));
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  async function deleteSpace(): Promise<RowActionResult> {
    const result = await api(`/api/spaces/${spaceId}`, { method: 'DELETE' });
    if (result.ok) {
      router.push(href('spaces'));
      return { ok: true };
    }
    return { ok: false, code: result.code, unavailable: result.unavailable };
  }

  function openLanding(landing: SearchLanding) {
    router.push(landing.type === 'space' ? href(`spaces/${landing.id}`) : href(`spaces/${landing.spaceId}/chat/${landing.threadId}`));
  }

  return (
    <div className="sp-page">
      <nav className="sp-breadcrumb" aria-label={t('Breadcrumb', '路徑')}>
        <Link href={href('spaces')}>{t('Spaces', '空間')}</Link>
      </nav>
      <header className="sp-head sp-head-row">
        <div className="sp-head-main">
          <h1>{space?.name ?? t('Chats', '對話')}</h1>
          {space?.description && <p>{space.description}</p>}
        </div>
        <div className="sp-head-actions">
          <UsageMeter />
          <button type="button" className="k-btn primary" onClick={() => void newChat()} disabled={busy}>
            {busy ? t('Creating…', '建立中…') : t('New chat', '新對話')}
          </button>
          {space && (
            <RowActions
              kind="space"
              name={space.name}
              archived={Boolean(space.archivedAt)}
              onRename={renameSpace}
              onArchived={archiveSpace}
              onDelete={deleteSpace}
            />
          )}
        </div>
      </header>
      {missingSpace && (
        <p className="sp-muted" role="status">
          {t('This space is not in your active list. It may have been archived or removed.', '此空間不在你的使用中清單，可能已被封存或移除。')}
        </p>
      )}
      {error && (
        <p role="alert" className="sp-error">
          {errorUnavailable
            ? t('Chats are unavailable right now. Try again shortly.', '對話服務暫時未能使用，請稍後再試。')
            : errorText(error, locale)}
        </p>
      )}
      <SearchPanel
        scope="space"
        spaceId={spaceId}
        localItems={(threads ?? []).map((thread) => ({ id: thread.id, title: thread.title }))}
        onOpen={openLanding}
      />
      {threads === null && !error && <p role="status">{t('Loading chats…', '正在載入對話…')}</p>}
      {threads?.length === 0 && <p className="sp-muted">{t('No chats yet. Start one.', '尚未有對話，開始第一個。')}</p>}
      <ul className="sp-list">
        {threads?.map((thread) => (
          <li key={thread.id} className="sp-row" data-archived={Boolean(thread.archivedAt)}>
            <Link className="sp-row-link" href={href(`spaces/${spaceId}/chat/${thread.id}`)}>
              <strong>{thread.title}</strong>
              <span className="sp-row-meta">
                {thread.pinnedAt && <span className="sp-badge">{t('Pinned', '已置頂')}</span>}
                {thread.messageCount === 1 ? t('1 message', '1 則訊息') : t(`${thread.messageCount} messages`, `${thread.messageCount} 則訊息`)}
              </span>
            </Link>
            <RowActions
              kind="chat"
              name={thread.title}
              archived={Boolean(thread.archivedAt)}
              onRename={(next) => renameThread(thread.id, next)}
              onArchived={(archived) => archiveThread(thread.id, archived)}
              onDelete={() => deleteThread(thread.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
