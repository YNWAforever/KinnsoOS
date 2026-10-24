export type ProgressState = 'pending' | 'visited' | 'skipped';
export type ProgressEntry = {stopId: string; state: ProgressState};
export type ProgressSnapshot = {
  ownerId: string;
  tripId: string;
  tripRevision: number;
  progressRevision: number;
  entries: ProgressEntry[];
};
export type ProgressIntent = Readonly<{
  requestId: string;
  stopId: string;
  state: ProgressState;
  expectedTripRevision: number;
  expectedProgressRevision: number;
}>;
export type ProgressAck = {
  snapshot: ProgressSnapshot;
  requestId: string;
  appliedProgressRevision: number;
  replayed: boolean;
};
