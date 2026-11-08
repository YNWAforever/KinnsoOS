'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../travel/ui';
import { isUuid } from '../../../lib/chat/contracts';
import type { ChatMessage } from '../../../lib/chat/contracts';
import { formatLatency } from './format';
import { parseToolResults } from './toolResults';
import type { LiveTool, SourceCard } from './toolResults';
import { readNumber, readText } from './values';

export type InterruptedReply = { id: string; text: string; reason: 'stopped' | 'error' };

function toolLabel(name: string): string {
  const cleaned = name.replace(/^kinnso[_-]?/i, '').replace(/[_-]+/g, ' ').trim();
  return cleaned || name;
}

/** Copy with an inline, visible confirmation (and a polite screen-reader status). */
export function CopyButton({ text, className = 'k-btn sp-secondary', testId }: { text: string; className?: string; testId?: string }) {
  const { t } = useApp();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        copied = document.execCommand('copy');
        area.remove();
      } catch {
        copied = false;
      }
    }
    setState(copied ? 'copied' : 'failed');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2200);
  }, [text]);

  const label = state === 'copied' ? t('Copied', '已複製') : state === 'failed' ? t('Copy failed', '複製失敗') : t('Copy', '複製');
  return (
    <>
      <button type="button" className={className} onClick={() => void copy()} data-testid={testId ?? 'copy-message'}>
        {label}
      </button>
      <span className="sp-visually-hidden" role="status" aria-live="polite">
        {state === 'copied'
          ? t('Message copied to the clipboard.', '訊息已複製到剪貼簿。')
          : state === 'failed'
            ? t('Copy failed. Select the text and copy it manually.', '複製失敗，請選取文字手動複製。')
            : ''}
      </span>
    </>
  );
}

function SourceItem({ card }: { card: SourceCard }) {
  const { t, href } = useApp();
  const target = card.id && isUuid(card.id) ? (card.kind === 'guide' ? `g/${card.id}` : `trips/${card.id}`) : null;
  const content = (
    <>
      <span className="sp-source-kind">{card.kind === 'guide' ? t('Guide', '攻略') : t('Trip', '行程')}</span>
      <span className="sp-source-title">{card.title}</span>
      {card.city && <span className="sp-source-city">{card.city}</span>}
      {card.snippet && <span className="sp-source-snippet">{card.snippet}</span>}
    </>
  );
  return (
    <li className="sp-source" data-kind={card.kind} data-static={target ? undefined : 'true'} data-testid="source-card">
      {target ? (
        <Link className="sp-source-link" href={href(target)}>
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

function ToolResults({ message }: { message: ChatMessage }) {
  const { t } = useApp();
  const parsed = useMemo(() => parseToolResults(message), [message]);
  if (parsed.cards.length === 0 && parsed.traces.length === 0) return null;
  return (
    <div className="sp-tools">
      {parsed.cards.length > 0 && (
        <ul className="sp-sources" aria-label={t('Sources', '來源')} data-testid="source-cards">
          {parsed.cards.map((card) => (
            <SourceItem key={card.key} card={card} />
          ))}
        </ul>
      )}
      {parsed.traces.length > 0 && (
        <ul className="sp-tool-chips" aria-label={t('Tools used', '使用的工具')} data-testid="tool-chips">
          {parsed.traces.map((trace) => (
            <li key={trace.key} className="sp-chip" data-ok={trace.ok}>
              <span className="sp-chip-name">{toolLabel(trace.name)}</span>
              {trace.summary && <span className="sp-chip-summary">{trace.summary}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetadataLine({ message }: { message: ChatMessage }) {
  const { t } = useApp();
  const parts: Array<{ key: string; label: string; text: string }> = [];
  const model = readText(message.metadata?.model);
  if (model && model !== 'unknown') {
    parts.push({
      key: 'model',
      label: t('Model', '模型'),
      text: model === 'none:tool-grounded' ? t('tool-grounded', '工具回覆') : model,
    });
  }
  const latency = readNumber(message.metadata?.latencyMs);
  const latencyText = latency !== null ? formatLatency(latency) : '';
  if (latencyText) parts.push({ key: 'latency', label: t('Latency', '延遲'), text: latencyText });
  const count = readNumber(message.metadata?.toolCount);
  if (count !== null && count > 0) {
    parts.push({ key: 'tools', label: t('Tools', '工具'), text: count === 1 ? t('1 call', '1 次') : t(`${count} calls`, `${count} 次`) });
  }
  if (parts.length === 0) return null;
  return (
    <p className="sp-msg-meta" data-testid="message-metadata">
      {parts.map((part, index) => (
        <span key={part.key} className="sp-msg-meta-part">
          {index > 0 && (
            <span aria-hidden="true" className="sp-meta-sep">
              {' · '}
            </span>
          )}
          {part.label}: {part.text}
        </span>
      ))}
    </p>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useApp();
  const role = message.role === 'user' ? t('You', '你') : message.role === 'tool' ? t('Tool', '工具') : t('Assistant', '助理');
  return (
    <li className={`sp-msg sp-msg-${message.role}`} data-testid="chat-message" data-message-id={message.id}>
      <span className="sp-role">{role}</span>
      <p className="sp-msg-body">{message.body}</p>
      <ToolResults message={message} />
      <MetadataLine message={message} />
      <div className="sp-msg-actions">
        <CopyButton text={message.body} />
      </div>
    </li>
  );
}

/** In-flight assistant reply: the text region is the polite live region. */
export function LiveBubble({ text, tools, sources = [] }: { text: string; tools: LiveTool[]; sources?: SourceCard[] }) {
  const { t } = useApp();
  return (
    <li className="sp-msg sp-msg-assistant sp-live" aria-busy="true" data-testid="streaming-reply">
      <span className="sp-role">{t('Assistant', '助理')}</span>
      <div className="sp-live-text" aria-live="polite" aria-atomic="false">
        {text ? <p className="sp-msg-body">{text}</p> : <p className="sp-thinking">{t('Thinking…', '正在整理…')}</p>}
      </div>
      {sources.length > 0 && (
        <ul className="sp-sources" aria-label={t('Sources', '來源')} data-testid="live-source-cards">
          {sources.map((card) => (
            <SourceItem key={card.key} card={card} />
          ))}
        </ul>
      )}
      {tools.length > 0 && (
        <ul className="sp-tool-chips" aria-label={t('Tools used', '使用的工具')}>
          {tools.map((tool) => (
            <li key={tool.id} className="sp-chip" data-status={tool.status}>
              <span className="sp-chip-name">{toolLabel(tool.name)}</span>
              {tool.status === 'running' && <span aria-hidden="true">…</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="sp-live-note" role="status">
        {t('Generating reply…', '正在生成回覆…')}
      </p>
    </li>
  );
}

/** A stopped or errored reply, explicitly labelled so it never reads as complete. */
export function InterruptedBubble({ reply, onRetry, busy }: { reply: InterruptedReply; onRetry: () => void; busy: boolean }) {
  const { t } = useApp();
  return (
    <li className="sp-msg sp-msg-assistant sp-interrupted" data-testid="interrupted-reply">
      <span className="sp-role">{t('Assistant', '助理')}</span>
      <p className="sp-interrupted-label" role="status">
        {reply.reason === 'stopped'
          ? t(
              'Interrupted — you stopped this reply. It is not a complete answer.',
              '已中斷——你停止了這次回覆，這不是完整答案。',
            )
          : t(
              'Interrupted by an error. It is not a complete answer.',
              '因錯誤而中斷，這不是完整答案。',
            )}
      </p>
      <p className="sp-msg-body">{reply.text || t('No text was received before it stopped.', '停止前未收到任何文字。')}</p>
      <div className="sp-msg-actions">
        <CopyButton text={reply.text} testId="copy-interrupted" />
        <button type="button" className="k-btn sp-secondary" onClick={onRetry} disabled={busy} data-testid="retry-interrupted">
          {t('Retry', '重試')}
        </button>
      </div>
    </li>
  );
}
