export type SourceCredit = {
  guideId: string; guideVersion: number; creatorId: string | null;
  creatorName: string; canonicalUrl: string | null; withdrawn: boolean;
};
export type TripStop = {
  id: string; placeId: string | null; title: string; position: number;
  travellerNote: string; startMinuteOfDay: number | null; durationMinutes: number | null;
  source: SourceCredit | null;
};
export type TripDay = { id: string; offset: number; title: string; stops: TripStop[] };
export type MediaRef = { id: string; ownerId: string; visibility: 'private'; state: 'pending' | 'ready' | 'failed' };
export type TripSnapshot = {
  id: string; title: string; destinationId: string | null; timezone: string;
  startDate: string | null; status: 'planning' | 'active' | 'archived'; revision: number;
  days: TripDay[]; media: MediaRef[];
  pendingPhotos?:{name:string;mime:string|null;size:number|null}[];
  overrides?:{stopId:string;code:string;reason:string}[];
};
export type StopInput = Pick<TripStop, 'placeId' | 'title' | 'travellerNote' | 'startMinuteOfDay' | 'durationMinutes'>;
export type TripCommand =
  | { type: 'patchTrip'; patch: Partial<Pick<TripSnapshot, 'title' | 'destinationId' | 'timezone' | 'startDate' | 'status'>> }
  | { type: 'addDay'; id: string; offset: number; title: string }
  | { type: 'updateDay'; id: string; patch: { offset?: number; title?: string } }
  | { type: 'removeDay'; id: string }
  | { type: 'addStop'; id: string; dayId: string; position: number; input: StopInput }
  | { type: 'updateStop'; id: string; patch: Partial<StopInput> }
  | { type: 'moveStop'; id: string; dayId: string; position: number }
  | { type: 'removeStop'; id: string }
  | { type: 'overrideWarning'; id: string; code:string; reason:string }
  | { type: 'attachMedia'; mediaId: string; stopId: string | null }
  | { type: 'detachMedia'; mediaId: string };
export type PublicStop = Pick<TripStop, 'id' | 'placeId' | 'title' | 'position' | 'startMinuteOfDay' | 'durationMinutes'> & {
  description: string; source: SourceCredit | null;
};
export type PublicDay = { id: string; offset: number; title: string; stops: PublicStop[] };
export type GuideSummary = { kind: 'summary'; id: string; title: string; summary: string; destinationId: string | null };
export type GuideSnapshot = {
  kind: 'itinerary'; id: string; version: number; title: string; destinationId: string | null; publishedAt: string;
  creator: { id: string; name: string; handle: string | null }; days: PublicDay[];
};
export type PublicTripProjection = { title: string; days: PublicDay[]; approvedMediaIds: string[] };
