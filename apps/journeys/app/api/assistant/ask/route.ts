import { apiContext, boundedBody, failure, reply } from '../../../../lib/api/server';
import { searchGuides, reserveChatTurn } from '../../../../lib/chat/server';
import { modelConfig } from '../../../../lib/ai/spaces-chat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type GuideRow = { id?: unknown; title?: unknown; summary?: unknown; city?: unknown; creator_name?: unknown };

const SYSTEM = [
  'You are a Kinnso catalogue assistant.',
  'Answer ONLY from the guide rows provided in the user message. Never invent guides, places, prices, availability or bookings.',
  'Cite guide titles exactly as given. If the rows do not answer the question, say so and suggest a different search.',
  'Keep answers under 120 words. Do not promise bookings, payments or availability; booking requests are requests, not confirmations.',
].join(' ');


const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'which', 'what', 'who', 'that', 'this', 'guide', 'guides', 'covers', 'cover', 'about', 'good', 'best', 'near', 'into', 'from', 'have', 'has', 'can', 'you', 'your', 'recommend', 'suggest', 'find', 'show', 'are', 'was', 'were', 'will', 'would', 'should', 'could', 'does', 'did', 'but', 'not', 'any', 'all', 'out', 'our', 'their', 'there', 'here', 'trip', 'travel', 'traveller', 'traveller', 'help', 'need', 'want', 'looking', 'look', 'tell', 'give', 'some', 'why', 'how', 'when', 'where', 'it', 'its', 'be', 'been', 'if', 'of', 'on', 'at', 'by', 'or', 'as', 'to', 'in', 'is', 'an', 'a']);

/** The catalogue search matches substrings, not natural-language questions, so a
 * full question usually returns nothing. Try the question first, then its
 * meaningful words, and merge by guide id. */
async function retrieveGuides(question: string): Promise<unknown[]> {
  const seen = new Map<string, unknown>();
  const add = (result: { items?: unknown[] } | null) => {
    for (const item of Array.isArray(result?.items) ? result.items : []) {
      const id = (item as { id?: unknown })?.id;
      if (typeof id === 'string' && !seen.has(id)) seen.set(id, item);
      if (seen.size >= 5) return;
    }
  };
  try { add(await searchGuides(question, 5)); } catch { /* fall through to keywords */ }
  if (seen.size === 0) {
    const words = [...new Set(question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !STOPWORDS.has(word)))].slice(0, 5);
    for (const word of words) {
      if (seen.size >= 5) break;
      try { add(await searchGuides(word, 5)); } catch { /* keep trying */ }
    }
  }
  return [...seen.values()].slice(0, 5);
}

function mapSources(items: unknown[]) {
  return items.slice(0, 5).map((item) => {
    const row = (item ?? {}) as GuideRow;
    return {
      id: typeof row.id === 'string' ? row.id : null,
      title: typeof row.title === 'string' ? row.title : null,
      city: typeof row.city === 'string' ? row.city : null,
      summary: typeof row.summary === 'string' ? row.summary.slice(0, 240) : null,
      creator: typeof row.creator_name === 'string' ? row.creator_name : null,
    };
  }).filter((source) => source.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.id));
}

function fallbackAnswer(sources: ReturnType<typeof mapSources>) {
  if (!sources.length) return 'No published guide matched that question. Try a destination, theme or audience such as “family”, “food” or “Kyoto”.';
  return 'Here are the published guides that matched. The model is not configured right now, so this is the catalogue result rather than a written answer: ' + sources.map((source) => source.title).filter(Boolean).join(' · ');
}

async function askModel(question: string, sources: ReturnType<typeof mapSources>, signal: AbortSignal) {
  const config = modelConfig();
  if (!config) return null;
  const rows = sources.map((source) => ({ title: source.title, city: source.city, summary: source.summary, creator: source.creator }));
  const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'KinnsoAssistant/1.0' };
  const sessionHeader = process.env.KINNSO_MODEL_SESSION_HEADER ?? '';
  if (sessionHeader) headers[sessionHeader] = 'catalogue-assistant';
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.modelId,
      stream: false,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Question: ${question}\n\nGuide rows (the only allowed source):\n${JSON.stringify(rows)}` },
      ],
    }),
    signal,
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content.trim().slice(0, 2000) : null;
}

/** One-shot, grounded catalogue assistant: retrieves published guides with the
 * same search behind the MCP tool, then asks the model to answer only from those
 * rows. It stores nothing and cannot book, charge or confirm anything. */
export async function POST(request: Request) {
  const ctx = await apiContext(request, 'conversation', true);
  if (ctx.response) return ctx.response;
  let input: unknown;
  try {
    input = await boundedBody(request, 4096);
  } catch {
    return failure('INVALID', 400);
  }
  const body = input as { question?: unknown } | null;
  if (!body || typeof body !== 'object') return failure('INVALID', 400);
  if (typeof body.question !== 'string') return failure('INVALID', 400);
  const question = body.question.trim().slice(0, 500);
  if (question.length < 3) return failure('INVALID', 400);

  let budget: Awaited<ReturnType<typeof reserveChatTurn>>;
  try {
    budget = await reserveChatTurn(Number.parseInt(process.env.KINNSO_CHAT_TURNS_PER_HOUR ?? '30', 10));
  } catch {
    return failure('UNAVAILABLE', 503);
  }
  if (!budget.allowed) {
    return reply({ ok: false, code: 'UNAVAILABLE', retryable: true, requestId: crypto.randomUUID(), resetAt: budget.resetAt, budget: { used: budget.used, limit: budget.limit } }, 429);
  }

  let items: unknown[] = [];
  try {
    items = await retrieveGuides(question);
  } catch {
    return failure('UNAVAILABLE', 503);
  }
  const sources = mapSources(items);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let answer: string | null = null;
  try {
    answer = await askModel(question, sources, controller.signal);
  } catch {
    answer = null;
  } finally {
    clearTimeout(timeout);
  }
  const usedModel = answer !== null;
  return reply({
    ok: true,
    data: {
      question,
      answer: answer ?? fallbackAnswer(sources),
      model: usedModel ? (process.env.KINNSO_MODEL_ID ?? 'model') : 'catalogue-fallback',
      sources,
      budget: { used: budget.used, limit: budget.limit, resetAt: budget.resetAt },
      notes: [
        'Answers come only from published catalogue rows listed in sources.',
        'This surface never books, charges or confirms availability; booking is a separate request flow.',
      ],
    },
  });
}
