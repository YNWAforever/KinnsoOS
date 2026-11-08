export type ChatRole = 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  id: string;
  sequence: number;
  role: ChatRole;
  body: string;
  toolName: string | null;
  toolPayload: Record<string, unknown>;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  spaceId: string;
  title: string;
  messageCount: number;
  updatedAt: string;
};

export type ChatSpace = {
  id: string;
  name: string;
  description: string;
  threadCount: number;
  updatedAt: string;
};

export type ChatThreadDetail = ChatThread & { messages: ChatMessage[]; model?: string };

export type ToolCallTrace = {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
};

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function defaultSpaceName(locale: 'en' | 'zh-HK'): string {
  return locale === 'zh-HK' ? '我的空間' : 'My space';
}

export function defaultChatTitle(locale: 'en' | 'zh-HK'): string {
  return locale === 'zh-HK' ? '新的對話' : 'New chat';
}
