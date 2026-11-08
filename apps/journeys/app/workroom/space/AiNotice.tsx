'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '../../travel/ui';

const KEY = 'kinnso-ai-notice-ack-v1';

/**
 * One-time, dismissible disclosure shown above the composer.
 * The acknowledgement is a local preference only; it never grants any permission.
 */
export function AiNotice({ actorId }: { actorId: string | null }) {
  const { t, href } = useApp();
  const [ack, setAck] = useState(true);

  useEffect(() => {
    try {
      setAck(window.localStorage.getItem(KEY) === '1');
    } catch {
      setAck(false);
    }
  }, [actorId]);

  if (ack) return null;

  function accept() {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable: the notice simply returns on the next visit */
    }
    setAck(true);
  }

  return (
    <section className="sp-ai-notice" aria-label={t('AI processing notice', 'AI 處理提示')}>
      <p>
        {t(
          'This assistant uses a third-party AI model. Your messages and the tool results for each turn are sent to the model provider to write the reply; chats are private to your account.',
          '本助理使用第三方 AI 模型。你的訊息及每回合的工具結果會傳送給模型供應商以撰寫回覆；對話只屬於你的帳戶。',
        )}{' '}
        <Link href={href('legal/privacy')}>{t('How chat data is handled', '對話資料如何處理')}</Link>
      </p>
      <button type="button" className="k-btn" onClick={accept}>
        {t('I understand', '我明白')}
      </button>
    </section>
  );
}
