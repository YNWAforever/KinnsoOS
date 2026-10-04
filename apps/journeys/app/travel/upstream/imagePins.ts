/** AdventureLog imagePins.ts, commit 5673ef5bb5aaa96081bc250ef1d16da8b45977e3.
 * Copyright (C) 2023–2026 Sean Morley. GPL-3.0.
 * Modified 2026-09-10: selected pure GeoJSON converters, replaced Svelte types.
 * License: /licenses/GPL-3.0.txt. Corresponding source: /source/kinnso-journeys-source.zip.
 */
type ImageSource = "url" | "upload";
type FullMapFeatureCollection<P> = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: number[] };
    properties: P;
  }[];
};
export type ImageMapPin = {
  id: string;
  image: string;
  latitude: number;
  longitude: number;
  source: ImageSource;
  is_primary: boolean;
  parent_type: string;
  parent_id: string;
  parent_name: string | null;
};

export type ImagePinParentType =
  | "location"
  | "lodging"
  | "transportation"
  | "visit"
  | "note";

export type ImagePinContext = {
  parentType: ImagePinParentType | string;
  parentId: string;
  parentName: string;
};

export type ImagePinProperties = {
  imageId: string;
  imageUrl: string;
  source: ImageSource;
  isPrimary: boolean;
  parentType: string;
  parentId: string;
  parentName: string;
};

export type ImagePinFeatureCollection =
  FullMapFeatureCollection<ImagePinProperties>;

export function imageMapPinToFeature(
  pin: ImageMapPin,
): ImagePinFeatureCollection["features"][number] {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [pin.longitude, pin.latitude],
    },
    properties: {
      imageId: pin.id,
      imageUrl: pin.image,
      source: pin.source,
      isPrimary: pin.is_primary,
      parentType: pin.parent_type,
      parentId: pin.parent_id,
      parentName: pin.parent_name ?? "",
    },
  };
}

export function imageMapPinsToGeoJson(
  pins: ImageMapPin[],
): ImagePinFeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map(imageMapPinToFeature),
  };
}
