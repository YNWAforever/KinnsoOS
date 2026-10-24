export type TripLocation = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type TripDayLocations = {
  tripId: string;
  dayId: string;
  revision: number;
  places: TripLocation[];
};
