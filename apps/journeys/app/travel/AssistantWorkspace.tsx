'use client';
import { useState } from 'react';
import { useApp } from './ui';

type Source = { id: string; title: string | null; city: string | null; summary: string | null; creator: string | null };
type Answer = {
  question: string;
  answer: string;
  model: string;
  sources: Source[];
  budget: { used: number; limit: number; resetAt: string };
  notes: string[];
};

/** Ask the published catalogue a question. Answers are grounded in the source
 * list and cannot book, charge or confirm anything; nothing is stored. */
export function AssistantWorkspace({ actorId }: { actorId: string | null }) {
  const { t, href } = useApp();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState<string | null>(null);

  const ask = async () => {
    const trimmed = question.trim();
    if (trimmed.length < 3) { setError(t('Write a question first.', '請先輸入問題。')); return; }
    setBusy(true); setError(null); setLimited(null);
    try {
      const response = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 429) {
        setLimited(payload?.resetAt ?? null);
        return;
      }
      if (response.status === 401) { window.location.href = href('sign-in') + '?next=' + encodeURIComponent('/assistant'); return; }
      if (!response.ok || !payload?.ok) { setError(t('The assistant could not answer. Retry.', '助理暫時未能回答，請重試。')); return; }
      setResult(payload.data as Answer);
    } catch {
      setError(t('The assistant could not answer. Retry.', '助理暫時未能回答，請重試。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="k-page" data-testid="assistant">
      <h1>{t('Ask the catalogue', '向目錄提問')}</h1>
      <p>{t('Ask about the published guides. Answers are generated only from the guide rows shown as sources; this cannot book, charge or confirm anything and stores no conversation.', '可就已發布攻略提問；答案只根據下方來源產生，不會預訂、收費或確認任何事項，也不會保存對話。')}</p>
      {!actorId ? (
        <p><a className="k-btn" href={href('sign-in') + '?next=' + encodeURIComponent('/assistant')}>{t('Sign in to ask', '登入後提問')}</a></p>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className="k-card" style={{ display: 'grid', gap: '8px' }}>
          <label style={{ display: 'grid', gap: '4px' }}>{t('Your question', '你的問題')}
            <input value={question} maxLength={500} placeholder={t('e.g. a family-friendly route in Singapore', '例如：新加坡適合家庭的行程')} onChange={(event) => setQuestion(event.target.value)} data-testid="assistant-question" />
          </label>
          <button type="submit" className="k-btn primary" disabled={busy} style={{ justifySelf: 'start' }} data-testid="assistant-submit">
            {busy ? t('Thinking…', '思考中…') : t('Ask', '提問')}
          </button>
        </form>
      )}
      {limited && (
        <p role="alert" data-testid="assistant-limited">
          {t('You have used the hourly assistant budget. Try again after', '你已用完本小時的助理額度，請稍後再試：')} {new Date(limited).toLocaleTimeString()}
        </p>
      )}
      {error && <p role="alert" data-testid="assistant-error">{error}</p>}
      {result && (
        <>
          <article className="k-card" data-testid="assistant-answer">
            <p data-testid="assistant-text">{result.answer}</p>
            <p className="k-meta" data-testid="assistant-model">
              {result.model === 'catalogue-fallback' ? t('Catalogue result (model not configured)', '目錄結果（未設定模型）') : `${t('Model', '模型')}: ${result.model}`} · {result.budget.used}/{result.budget.limit} {t('turns this hour', '本小時對話')}
            </p>
          </article>
          <h2>{t('Sources', '來源')}</h2>
          {result.sources.length === 0 ? <p>{t('No published guide matched.', '沒有符合的已發布攻略。')}</p> : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }} data-testid="assistant-sources">
              {result.sources.map((source) => (
                <li key={source.id} className="k-card" data-testid="assistant-source">
                  <a href={href('g/' + source.id)}><strong>{source.title}</strong></a>
                  {source.city && <span className="k-meta"> · {source.city}</span>}
                  {source.summary && <span className="k-meta" style={{ display: 'block' }}>{source.summary}</span>}
                </li>
              ))}
            </ul>
          )}
          <ul className="k-meta" style={{ paddingLeft: '1.1rem' }}>
            {result.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
