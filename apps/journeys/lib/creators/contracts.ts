import type { Step, JobStatus } from './progress';
import type { GuideSnapshot } from '../contracts/trips';
import { request } from '../trips/repository';
export type Profile = { bio: string; niches: string[]; content_pillars: string[]; tone: string[]; languages: string[] };
export type CreatorProgress = { step: Step; jobId: string | null; jobStatus: JobStatus | null; retryable: boolean; profile: Profile; profileReady: boolean; handles: { platform: string; handle: string }[]; scanAvailable: boolean };
export type DraftContent = { days: { offset: number; title: string; stops: { title: string; description: string; placeId: string | null; startMinuteOfDay: number | null; durationMinutes: number | null }[] }[] };
export type DraftPayload = { title: string; city: string; summary: string; content: DraftContent };
export type GuideDraft = { id: string; revision: number; publishedVersion: number; sourceChanged: boolean; status: 'draft' | 'published'; payload: DraftPayload; title: string; city: string; summary: string };
export const emptyProfile = (): Profile => ({ bio: '', niches: [], content_pillars: [], tone: [], languages: [] });
export const emptyDraft = (): DraftPayload => ({ title: '', city: '', summary: '', content: { days: [{ offset: 0, title: '', stops: [{ title: '', description: '', placeId: null, startMinuteOfDay: null, durationMinutes: null }] }] } });
export const creators = {
 progress: () => request<CreatorProgress>('/api/creator/profile'),
 confirm: (profile: Profile, requestId: string) => request<{ status: 'active' }>('/api/creator/profile', 'POST', { profile, confirmed: true, requestId }),
 handles: (handles: CreatorProgress['handles']) => request<{ saved: true }>('/api/creator/handles', 'POST', { handles }),
 scan: (jobId?: string) => request<{ jobId: string }>('/api/creator/scan', 'POST', { jobId: jobId ?? null }),
 list: (after?: string) => request<{ items: GuideDraft[]; nextCursor: string | null }>('/api/creator/guides' + (after ? '?after=' + encodeURIComponent(after) : '')),
 get: (id: string) => request<GuideDraft>('/api/creator/guides/' + encodeURIComponent(id)),
 save: (id: string, expectedRevision: number, requestId: string, payload: DraftPayload) => request<GuideDraft>('/api/creator/guides/' + encodeURIComponent(id), 'PUT', { expectedRevision, requestId, payload }),
 publish: (id: string, expectedRevision: number, requestId: string) => request<{ draft: GuideDraft; snapshot: GuideSnapshot }>('/api/creator/guides/' + encodeURIComponent(id) + '/publish', 'POST', { expectedRevision, requestId }),
 withdraw: (id: string) => request<{ withdrawn: true }>('/api/creator/guides/' + encodeURIComponent(id) + '/withdraw', 'POST', {}),
};
