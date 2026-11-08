import type { Locale } from '../../travel/model';
import { readNumber, readRecord, readText } from './values';

/** Turn budget echoed by a 429; every field is optional on older servers. */
export type RateLimit = {
  limit: number | null;
  used: number | null;
  resetAt: string | null;
};

export type ApiOk<T> = { ok: true; data: T };

export type ApiFail = {
  ok: false;
  code: string;
  status: number;
  /** True when the route or HTTP method itself looks absent (server half not deployed yet). */
  unavailable: boolean;
  rateLimit?: RateLimit;
};

export type ApiResult<T> = ApiOk<T> | ApiFail;

const FALLBACK_CODES: Record<number, string> = {
  400: 'INVALID',
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'UNAVAILABLE',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  501: 'UNAVAILABLE',
  503: 'UNAVAILABLE',
};

export function rateLimitFrom(payload: Record<string, unknown> | null): RateLimit {
  return {
    limit: readNumber(payload?.limit),
    used: readNumber(payload?.used),
    resetAt: readText(payload?.resetAt),
  };
}

/**
 * Calls one spaces endpoint and normalises both the `{ok:true,data}` envelope and
 * plain HTTP failures into one result type. Network errors never throw.
 */
export async function api<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'OFFLINE', status: 0, unavailable: true };
  }

  const raw = await response.json().catch(() => null);
  const payload = readRecord(raw);
  if (response.ok && payload && payload.ok === true && 'data' in payload) {
    return { ok: true, data: payload.data as T };
  }

  const code = readText(payload?.code) ?? FALLBACK_CODES[response.status] ?? 'UNAVAILABLE';
  // A Next.js route with no matching handler answers with an empty 404/405 and
  // no JSON envelope; that is the "endpoint not deployed yet" signal.
  const routeMissing = payload === null && (response.status === 404 || response.status === 405 || response.status === 501);
  const unavailable = routeMissing || response.status === 405 || code === 'UNAVAILABLE';
  const failure: ApiFail = { ok: false, code, status: response.status, unavailable };
  if (code === 'RATE_LIMITED' || response.status === 429) failure.rateLimit = rateLimitFrom(payload);
  return failure;
}

const EN: Record<string, string> = {
  AUTH_REQUIRED: 'Sign in to use your spaces.',
  NOT_FOUND: 'That space or chat was not found.',
  UNAVAILABLE: 'The private service is unavailable right now. Try again shortly.',
  INVALID: 'The input was rejected. Correct it and try again.',
  CONFLICT: 'The same request id carried different content. Reload and retry.',
  FORBIDDEN: 'Your account is not allowed to do that.',
  OFFLINE: 'The network is unreachable. Check the connection and try again.',
  RATE_LIMITED: 'The hourly reply limit was reached.',
  REGENERATE_UNAVAILABLE: 'Regenerate is not available yet on this server.',
  TURN_FAILED: 'The reply could not be completed. Try again.',
};

const ZH: Record<string, string> = {
  AUTH_REQUIRED: '請先登入才能使用你的空間。',
  NOT_FOUND: '找不到這個空間或對話。',
  UNAVAILABLE: '私人服務暫時未能接通，請稍後再試。',
  INVALID: '輸入未獲接納，請修正後再試。',
  CONFLICT: '相同的請求內容不一致，請重新載入後再試。',
  FORBIDDEN: '你的帳戶未獲授權進行此操作。',
  OFFLINE: '網絡未能連接，請檢查連線後再試。',
  RATE_LIMITED: '已達到每小時回覆上限。',
  REGENERATE_UNAVAILABLE: '此伺服器暫時未能重新生成回覆。',
  TURN_FAILED: '回覆未能完成，請再試一次。',
};

export function errorText(code: string, locale: Locale): string {
  const table = locale === 'zh-HK' ? ZH : EN;
  return table[code] ?? (locale === 'zh-HK' ? '未能完成請求。' : 'The request could not be completed.');
}

/** Copy shown when a rename/archive/delete route is not deployed yet. */
export function unsupportedActionText(locale: Locale): string {
  return locale === 'zh-HK'
    ? '此操作暫時未能使用。工作區更新部署後重新載入即可。'
    : 'This action is not available yet. Reload once the workspace update is deployed.';
}
