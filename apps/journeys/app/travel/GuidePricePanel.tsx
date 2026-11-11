'use client';
import { useEffect, useId, useState } from 'react';
import { creators } from '../../lib/creators/contracts';
import { formatGuidePrice, parseGuidePrice } from '../../lib/creators/pricing';
import { useApp } from './ui';

type State = 'loading' | 'hidden' | 'ready';
type PriceError = 'format' | 'range' | 'unconfirmed';

/** Creator-owned flat price for one guide, in HKD minor units. The panel stays
 *  invisible unless the payments runtime flag is enabled, so production remains
 *  inert while the flag is off; no traveller surface reads this value yet. */
export function GuidePricePanel({ guideId }: { guideId: string }) {
  const { t } = useApp();
  const headingId = 'guide-price-' + useId();
  const [state, setState] = useState<State>('loading');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PriceError | null>(null);
  const [notice, setNotice] = useState<'saved' | 'cleared' | null>(null);

  useEffect(() => {
    let active = true;
    creators.price(guideId).then((result) => {
      if (!active) return;
      if (!result.ok || result.data.paymentsEnabled !== true) { setState('hidden'); return; }
      setInput(formatGuidePrice(result.data.priceMinor));
      setState('ready');
    }).catch(() => { if (active) setState('hidden'); });
    return () => { active = false; };
  }, [guideId]);

  const save = async () => {
    const parsed = parseGuidePrice(input);
    if (!parsed.ok) { setError(parsed.reason); setNotice(null); return; }
    setBusy(true); setError(null); setNotice(null);
    const result = await creators.setPrice(guideId, parsed.priceMinor);
    setBusy(false);
    if (!result.ok) { setError('unconfirmed'); return; }
    setInput(formatGuidePrice(result.data.priceMinor));
    setNotice(result.data.priceMinor === null ? 'cleared' : 'saved');
  };

  if (state !== 'ready') return null;
  const helpId = headingId + '-help';
  const errorId = headingId + '-error';
  return (
    <section className="k-card" aria-labelledby={headingId} data-testid="guide-price" data-state="ready">
      <h2 id={headingId} style={{ marginTop: 0 }}>{t('Price', '價格')}</h2>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} style={{ display: 'grid', gap: '8px', maxWidth: '30rem' }}>
        <label style={{ display: 'grid', gap: '4px' }}>{t('Price in HKD', '價格（HKD）')}
          <input type="text" inputMode="decimal" autoComplete="off" maxLength={12} value={input}
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            aria-invalid={error === 'format' || error === 'range'}
            onChange={(event) => { setInput(event.target.value); setError(null); setNotice(null); }}
            data-testid="guide-price-input" />
        </label>
        <p className="k-meta" id={helpId}>{t('HK$1 to HK$100,000. Leave blank for no price.', 'HK$1 至 HK$100,000；留空即不設價格。')}</p>
        <button type="submit" className="k-btn" disabled={busy} style={{ justifySelf: 'start' }} data-testid="guide-price-save">
          {busy ? t('Saving price…', '正在保存價格…') : t('Save price', '保存價格')}
        </button>
      </form>
      {error && <p role="alert" id={errorId} data-testid="guide-price-error">{error === 'format' ? t('Enter an amount in HKD with up to two decimal places.', '請輸入最多兩位小數的 HKD 金額。') : error === 'range' ? t('Enter an amount from HK$1 to HK$100,000, or leave it blank.', '請輸入 HK$1 至 HK$100,000 之間的金額，或留空。') : t('The price was not confirmed. Your input is kept; retry the same amount.', '價格尚未確認，輸入已保留；請重試同一金額。')}</p>}
      {notice && <p role="status" data-testid="guide-price-notice">{notice === 'cleared' ? t('Price cleared.', '價格已清除。') : t('Price saved.', '價格已保存。')}</p>}
    </section>
  );
}
