"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Locale, Stop } from "./model";
import { imageMapPinsToGeoJson } from "./upstream/imagePins";
export function stopsToGeoJson(stops: Stop[], locale: Locale) {
  return imageMapPinsToGeoJson(
    stops
      .filter(
        (s) =>
          s.lat !== null &&
          s.lng !== null &&
          Number.isFinite(s.lat) &&
          Number.isFinite(s.lng) &&
          Math.abs(s.lat) <= 85 &&
          Math.abs(s.lng) <= 180,
      )
      .map((s) => ({
        id: s.id,
        image: s.image || "",
        latitude: s.lat!,
        longitude: s.lng!,
        source: "url",
        is_primary: true,
        parent_type: "stop",
        parent_id: s.id,
        parent_name: s.name[locale],
      })),
  );
}
const project = (lat: number, lng: number, z: number) => {
  const n = 256 * 2 ** z,
    sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * n,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n,
  };
};
export default function TripMap({
  stops,
  locale,
  selected,
  onSelect,
  failed = false,
}: {
  stops: Stop[];
  locale: Locale;
  selected?: string;
  onSelect: (id: string) => void;
  failed?: boolean;
}) {
  const zh = locale === "zh-HK",
    ref = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ w: 520, h: 480 }),
    [zoom, setZoom] = useState(13),
    [offset, setOffset] = useState({ x: 0, y: 0 }),
    [tileError, setTileError] = useState(false),
    [retry, setRetry] = useState(0);
  const geo = useMemo(() => stopsToGeoJson(stops, locale), [stops, locale]),
    coords = geo.features.map((f) => f.geometry.coordinates),
    selectedPoint = geo.features.find((f) => f.properties.parentId === selected)
      ?.geometry.coordinates;
  const center = coords.length
    ? {
        lat: coords.reduce((n, c) => n + c[1], 0) / coords.length,
        lng: coords.reduce((n, c) => n + c[0], 0) / coords.length,
      }
    : { lat: 22.3, lng: 114.17 };
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const signature = stops.map((s) => `${s.id}:${s.lat}:${s.lng}`).join("|");
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setTileError(false);
    const xs = coords.map((c) => c[0]),
      ys = coords.map((c) => c[1]),
      span = coords.length
        ? Math.max(
            Math.max(...xs) - Math.min(...xs),
            Math.max(...ys) - Math.min(...ys),
          )
        : 0;
    setZoom(
      span > 90
        ? 2
        : span > 20
          ? 4
          : span > 4
            ? 6
            : span > 1
              ? 8
              : span > 0.2
                ? 10
                : span > 0.08
                  ? 11
                  : 13,
    );
  }, [signature]);
  const point = project(center.lat, center.lng, zoom),
    origin = {
      x: point.x - size.w / 2 + offset.x,
      y: point.y - size.h / 2 + offset.y,
    };
  const tiles = [];
  for (
    let x = Math.floor(origin.x / 256);
    x <= Math.floor((origin.x + size.w) / 256);
    x++
  )
    for (
      let y = Math.floor(origin.y / 256);
      y <= Math.floor((origin.y + size.h) / 256);
      y++
    )
      if (y >= 0 && y < 2 ** zoom)
        tiles.push({
          x,
          y,
          url: `https://tile.openstreetmap.org/${zoom}/${((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom}/${y}.png`,
        });
  return (
    <div
      className="k-map"
      ref={ref}
      role="region"
      aria-label={zh ? "行程地圖" : "Trip map"}
      data-pin-count={geo.features.length}
    >
      {!failed &&
        !tileError &&
        tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}-${zoom}-${retry}`}
            className="k-tile"
            src={t.url}
            alt=""
            style={{ left: t.x * 256 - origin.x, top: t.y * 256 - origin.y }}
            onError={() => setTileError(true)}
          />
        ))}
      {(failed || tileError) && (
        <div className="k-map-error">
          <strong>
            {zh ? "地圖暫時未能載入" : "Map is temporarily unavailable"}
          </strong>
          <p>
            {zh
              ? "所有站點仍可在列表選取及編輯。"
              : "You can still select and edit every stop in the list."}
          </p>
          <button
            className="k-btn"
            onClick={() => {
              setTileError(false);
              setRetry((x) => x + 1);
            }}
          >
            {zh ? "重試地圖" : "Retry map"}
          </button>
        </div>
      )}
      {!failed &&
        !tileError &&
        geo.features.map((f) => {
          const i = stops.findIndex((s) => s.id === f.properties.parentId);
          const p = project(
            f.geometry.coordinates[1],
            f.geometry.coordinates[0],
            zoom,
          );
          return (
            <button
              key={f.properties.parentId}
              className={`k-pin ${selected === f.properties.parentId ? "active" : ""}`}
              style={{ left: p.x - origin.x, top: p.y - origin.y }}
              onClick={() => onSelect(f.properties.parentId)}
              aria-label={`${i + 1}. ${f.properties.parentName}`}
              aria-pressed={selected === f.properties.parentId}
            >
              {i + 1}
            </button>
          );
        })}
      <div className="k-map-title">
        {zh ? "站點地圖" : "Places on this trip"}{" "}
        <span>
          {geo.features.length} {zh ? "個位置" : "locations"}
        </span>
      </div>
      {!failed && !tileError && (
        <div className="k-map-controls">
          <button
            aria-label={zh ? "放大" : "Zoom in"}
            onClick={() => setZoom((z) => Math.min(17, z + 1))}
          >
            +
          </button>
          <button
            aria-label={zh ? "縮小" : "Zoom out"}
            onClick={() => setZoom((z) => Math.max(2, z - 1))}
          >
            −
          </button>
          <button
            aria-label={zh ? "移向選取站點" : "Focus selected stop"}
            onClick={() => {
              if (selectedPoint) {
                const p = project(selectedPoint[1], selectedPoint[0], zoom);
                setOffset({ x: p.x - point.x, y: p.y - point.y });
              } else setOffset({ x: 0, y: 0 });
            }}
          >
            ◎
          </button>
          <button
            aria-label={zh ? "向北移動" : "Pan north"}
            onClick={() => setOffset((o) => ({ ...o, y: o.y - 120 }))}
          >
            ↑
          </button>
          <button
            aria-label={zh ? "向南移動" : "Pan south"}
            onClick={() => setOffset((o) => ({ ...o, y: o.y + 120 }))}
          >
            ↓
          </button>
        </div>
      )}
      {!failed && !tileError && (
        <div className="k-map-caption">
          {zh
            ? "位置參考，非道路導航"
            : "Location reference · not road directions"}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap
          </a>
        </div>
      )}
      {!geo.features.length && !failed && !tileError && (
        <div className="k-map-empty">
          {zh
            ? "確認位置後，站點會在這裏顯示。"
            : "Confirm a location to see it on the map."}
        </div>
      )}
    </div>
  );
}
