'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './ui';

type RequestRow = {
  id: string;
  kind: 'export' | 'delete' | 'access' | 'correction';
  scope: 'ai_conversations' | 'creator_content' | 'account';
  note: string;
  status: 'received' | 'in_progress' | 'completed' | 'rejected';
  resolutionNote: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<RequestRow['status'], [string, string]> = {
  received: ['Received', '已收到'],
  in_progress: ['In progress', '處理中'],
  completed: ['Completed', '已完成'],
  rejected: ['Rejected', '已拒絕'],
};

/** Data rights on this account: download, delete AI conversations, request anything else. */
export function DataRights() {
  const { t } = useApp();
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [listError, setListError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<{ kind: 'export' | 'delete' | 'access' | 'correction'; scope: 'ai_conversations' | 'creator_content' | 'account'; note: string }>({
    kind: 'access',
    scope: 'account',
    note: '',
  });

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/privacy/requests', { cache: 'no-store' });
      if (!response.ok) { setListError(true); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok || !Array.isArray(payload.data?.items)) { setListError(true); return; }
      setRequests(payload.data.items);
      setListError(false);
    } catch {
      setListError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const exportData = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/privacy/data', { cache: 'no-store' });
      if (!response.ok) { setError(t('The export could not be generated. Retry.', '匯出未能產生，請重試。')); return; }
      const payload = await response.json().catch(() => null);
      if (!payload?.ok) { setError(t('The export could not be generated. Retry.', '匯出未能產生，請重試。')); return; }
      const blob = new Blob([JSON.stringify(payload.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kinnso-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(t('Export downloaded. It contains your chats, guides, drafts and attestations.', '已下載匯出檔，內含你的對話、攻略、草稿及聲明。'));
    } catch {
      setError(t('The export could not be generated. Retry.', '匯出未能產生，請重試。'));
    } finally {
      setBusy(false);
    }
  };

  const deleteConversations = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/privacy/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'ai_conversations', confirm: true }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status !== 200 || !payload?.ok) {
        setError(t('Deletion could not be completed. Retry or use the request form.', '刪除未能完成，請重試或使用申請表格。'));
        return;
      }
      setMessage(t('AI conversations deleted: {removed}. This includes chats and message text.', '已刪除 AI 對話：{removed}。包括對話及訊息內容。').replace('{removed}', JSON.stringify(payload.data.removed)));
      setConfirmDelete(false);
      await load();
    } catch {
      setError(t('Deletion could not be completed. Retry or use the request form.', '刪除未能完成，請重試或使用申請表格。'));
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/privacy/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (response.status !== 201 || !payload?.ok) {
        setError(t('The request could not be recorded. Check the fields and retry.', '申請未能記錄，請檢查欄位後重試。'));
        return;
      }
      setMessage(t('Request recorded. Operations will respond through this page.', '申請已記錄，營運團隊將透過此頁面回覆。'));
      setForm((f) => ({ ...f, note: '' }));
      await load();
    } catch {
      setError(t('The request could not be recorded. Check the fields and retry.', '申請未能記錄，請檢查欄位後重試。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="k-page" data-testid="data-rights">
      <h1>{t('Your data', '你的資料')}</h1>
      <p>{t('Download what we hold, delete your AI conversations, or ask us to handle anything that cannot be erased in one click.', '下載我們保存的資料、刪除你的 AI 對話，或就無法一鍵刪除的內容提出申請。')}</p>

      <section className="k-card" data-testid="data-rights-export">
        <h2>{t('Export', '匯出')}</h2>
        <p>{t('A JSON file with your chats, messages, guides, drafts and attestations.', '包含對話、訊息、攻略、草稿及聲明的 JSON 檔案。')}</p>
        <button type="button" className="k-btn primary" onClick={() => void exportData()} disabled={busy} data-testid="data-rights-export-button">
          {busy ? t('Working…', '處理中…') : t('Download my data', '下載我的資料')}
        </button>
      </section>

      <section className="k-card" data-testid="data-rights-delete">
        <h2>{t('Delete AI conversations', '刪除 AI 對話')}</h2>
        <p>{t('Removes your spaces, chats and message text. Published guides are not deleted here.', '刪除你的空間、對話及訊息內容；已發布攻略不會在此刪除。')}</p>
        {!confirmDelete ? (
          <button type="button" className="k-btn" onClick={() => setConfirmDelete(true)} disabled={busy} data-testid="data-rights-delete-start">
            {t('Delete my AI conversations', '刪除我的 AI 對話')}
          </button>
        ) : (
          <div data-testid="data-rights-delete-confirm">
            <p role="alert">{t('This cannot be undone. Delete every space, chat and message?', '此操作無法復原，確定刪除所有空間、對話及訊息？')}</p>
            <button type="button" className="k-btn primary" onClick={() => void deleteConversations()} disabled={busy} data-testid="data-rights-delete-confirm-button">
              {busy ? t('Deleting…', '刪除中…') : t('Yes, delete them', '確定刪除')}
            </button>
            <button type="button" className="k-btn" onClick={() => setConfirmDelete(false)} disabled={busy} data-testid="data-rights-delete-cancel">
              {t('Cancel', '取消')}
            </button>
          </div>
        )}
      </section>

      <section className="k-card" data-testid="data-rights-request">
        <h2>{t('Request something else', '提出其他申請')}</h2>
        <form onSubmit={(event) => { event.preventDefault(); void submitRequest(); }} style={{ display: 'grid', gap: '10px' }}>
          <label style={{ display: 'grid', gap: '4px' }}>{t('What do you need?', '你需要什麼？')}
            <select value={form.kind} onChange={(event) => setForm((f) => ({ ...f, kind: event.target.value as typeof f.kind }))} style={{ maxWidth: '22rem' }} data-testid="data-rights-kind">
              <option value="access">{t('Access a copy', '取得副本')}</option>
              <option value="delete">{t('Delete data', '刪除資料')}</option>
              <option value="correction">{t('Correct data', '更正資料')}</option>
              <option value="export">{t('Export help', '匯出協助')}</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>{t('Which data?', '哪類資料？')}
            <select value={form.scope} onChange={(event) => setForm((f) => ({ ...f, scope: event.target.value as typeof f.scope }))} style={{ maxWidth: '22rem' }} data-testid="data-rights-scope">
              <option value="account">{t('My account', '我的帳戶')}</option>
              <option value="ai_conversations">{t('AI conversations', 'AI 對話')}</option>
              <option value="creator_content">{t('Creator content', '創作者內容')}</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>{t('Details (optional)', '詳情（可選）')}
            <textarea value={form.note} rows={3} maxLength={1000} style={{ width: '100%', maxWidth: '36rem' }} onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))} data-testid="data-rights-note" />
          </label>
          <button type="submit" className="k-btn primary" disabled={busy} style={{ justifySelf: 'start' }} data-testid="data-rights-submit">
            {busy ? t('Submitting…', '提交中…') : t('Submit request', '提交申請')}
          </button>
        </form>
        {message && <p role="status" data-testid="data-rights-message">{message}</p>}
        {error && <p role="alert" data-testid="data-rights-error">{error}</p>}
      </section>

      <section className="k-card" data-testid="data-rights-history">
        <h2>{t('Your requests', '你的申請')}</h2>
        {requests === null && !listError && <p aria-live="polite">{t('Loading…', '載入中…')}</p>}
        {listError && <p role="alert">{t('Your requests could not be loaded. Retry later.', '申請未能載入，請稍後重試。')}</p>}
        {requests && requests.length === 0 && <p>{t('No requests yet.', '尚未有申請。')}</p>}
        {requests && requests.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
            {requests.map((row) => (
              <li key={row.id} style={{ borderTop: '1px solid var(--k-border, #e2e8f0)', paddingTop: '8px' }} data-testid="data-rights-request-row" data-status={row.status}>
                <strong>{row.kind} · {row.scope}</strong> · {t(STATUS_LABEL[row.status][0], STATUS_LABEL[row.status][1])}
                <span className="k-meta" style={{ display: 'block' }}>{new Date(row.createdAt).toLocaleString()}{row.note ? ` · ${row.note}` : ''}</span>
                {row.resolutionNote && <span className="k-meta" style={{ display: 'block' }}>{row.resolutionNote}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="os-note" role="note">{t('Retention: AI conversations stay until you delete them; hourly turn counters expire hourly; exports are generated per request and never stored server-side.', '保存期限：AI 對話會保留至你刪除；每小時對話計數於下一小時失效；匯出檔按申請即時產生，不會在伺服器保存。')}</p>
    </section>
  );
}
