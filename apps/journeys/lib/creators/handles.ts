/** Framework-free mature handle rules, shared with the original onboarding host. */
export const PLATFORMS = ['instagram', 'youtube', 'threads'] as const;
export type Platform = typeof PLATFORMS[number];
export function isPlatform(x: string): x is Platform { return (PLATFORMS as readonly string[]).includes(x); }
export function normalizeHandle(raw: string): string {
 let s = raw.trim(); const match = s.match(/^https?:\/\/[^/]+\/(.+)$/i);
 if (match) s = match[1].split('/').filter(Boolean)[0] ?? '';
 if (s.startsWith('@')) s = s.slice(1);
 return s.trim();
}
const patterns: Record<Platform, RegExp> = { instagram: /^[A-Za-z0-9._]+$/, youtube: /^[A-Za-z0-9._-]+$/, threads: /^[A-Za-z0-9_]+$/ };
export type HandleValidation = { ok: true; value: string } | { ok: false; error: 'empty' | 'format' | 'length' | 'platform' };
export function validateHandle(platform: string, raw: string): HandleValidation {
 if (!isPlatform(platform)) return { ok: false, error: 'platform' };
 const value = normalizeHandle(raw);
 if (!value.length) return { ok: false, error: 'empty' };
 if (value.length > 30) return { ok: false, error: 'length' };
 if (!patterns[platform].test(value)) return { ok: false, error: 'format' };
 return { ok: true, value };
}
export function handleUrl(platform: Platform, value: string): string {
 switch (platform) {
  case 'instagram': return `https://www.instagram.com/${value}/`;
  case 'youtube': return `https://www.youtube.com/@${value}`;
  case 'threads': return `https://www.threads.net/@${value}`;
 }
}
