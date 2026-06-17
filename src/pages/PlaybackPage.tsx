import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";

const KEY = import.meta.env.VITE_MAPTILER_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/openstreetmap/style.json?key=${KEY}`;
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ─── Types ──────────────────────────────────────────────────────────────────

type PlaybackPoint = {
  imei: string;
  time: string;
  lat: number;
  lon: number;
  speed_kph: number;
  course: number;
  satellites?: number;
};

// ─── Car icon (sky accent, matching the app shell) ───────────────────────────

function makeCarImage(color: string): Promise<HTMLImageElement> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <circle cx="19" cy="19" r="17" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1"/>
    <rect x="13" y="16" width="12" height="13" rx="3" fill="${color}" stroke="#0a0c10" stroke-width="1.5"/>
    <path d="M13 20 L19 9 L25 20 Z" fill="${color}" stroke="#0a0c10" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="11" y="20" width="3" height="5" rx="1.5" fill="#0a0c10" opacity="0.85"/>
    <rect x="24" y="20" width="3" height="5" rx="1.5" fill="#0a0c10" opacity="0.85"/>
    <rect x="15" y="20" width="8" height="5" rx="1" fill="white" fill-opacity="0.25"/>
  </svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image(38, 38);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function PlaybackPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLoadedRef = useRef(false);

  const [devices, setDevices] = useState<string[]>([]);
  const [imei, setImei] = useState("");
  const [from, setFrom] = useState(() => toDatetimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => toDatetimeLocal(new Date()));

  const [points, setPoints] = useState<PlaybackPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playIndex, setPlayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(20);

  const rafRef = useRef<number | null>(null);

  // ── Load the device list once, so the dropdown isn't empty ──
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/latest`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { imei: string }[]) => {
        const ids = rows.map((r) => r.imei);
        setDevices(ids);
        setImei((current) => current || ids[0] || "");
      })
      .catch(() => {});
  }, []);

  // ── Map init, once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [28.2833, -15.4167],
      zoom: 11.5,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      void (async () => {
        const img = await makeCarImage("#38bdf8");
        map.addImage("car-playback", img);

        map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: { "line-color": "#38bdf8", "line-width": 3, "line-opacity": 0.6 },
        });

        map.addSource("car", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "car-icon",
          type: "symbol",
          source: "car",
          layout: {
            "icon-image": "car-playback",
            "icon-size": 1,
            "icon-rotate": ["get", "heading"],
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "map",
            "icon-allow-overlap": true,
          },
        });

        mapLoadedRef.current = true;
      })();
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch playback history for the selected device + range ──
  async function loadPlayback() {
    if (!imei) {
      setError("Choose a device first.");
      return;
    }
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setPlayIndex(0);

    try {
      const params = new URLSearchParams({
        imei,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      });
      const res = await fetch(`${API_BASE_URL}/api/playback?${params.toString()}`);
      if (!res.ok) throw new Error(`The server returned an error (HTTP ${res.status}).`);
      const data: PlaybackPoint[] = await res.json();
      setPoints(data);
      if (data.length === 0) {
        setError("No positions were recorded for this device in that time range.");
      }
    } catch (e) {
      setPoints([]);
      setError(e instanceof Error ? e.message : "Couldn't load playback data.");
    } finally {
      setLoading(false);
    }
  }

  // ── Draw the trail + fit the map whenever a new route loads ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource("route") as GeoJSONSource | undefined;
    if (!src) return;

    const features: Feature<LineString>[] =
      points.length > 1
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: points.map((p) => [p.lon, p.lat]) },
            },
          ]
        : [];
    src.setData({ type: "FeatureCollection", features } as FeatureCollection<LineString>);

    if (points.length) {
      const bounds = points.reduce(
        (b, p) => b.extend([p.lon, p.lat]),
        new maplibregl.LngLatBounds([points[0].lon, points[0].lat], [points[0].lon, points[0].lat]),
      );
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
    }
  }, [points]);

  // ── Interpolate a smooth position + heading between the two surrounding points ──
  const interpolated = useMemo(() => {
    if (points.length === 0) return null;
    if (points.length === 1) {
      return { lat: points[0].lat, lon: points[0].lon, heading: points[0].course, point: points[0] };
    }
    const clamped = Math.max(0, Math.min(points.length - 1, playIndex));
    const i0 = Math.floor(clamped);
    const i1 = Math.min(points.length - 1, i0 + 1);
    const t = clamped - i0;
    const p0 = points[i0];
    const p1 = points[i1];
    const lat = p0.lat + (p1.lat - p0.lat) * t;
    const lon = p0.lon + (p1.lon - p0.lon) * t;
    const heading = p0.lat !== p1.lat || p0.lon !== p1.lon ? bearing(p0.lat, p0.lon, p1.lat, p1.lon) : p0.course;
    return { lat, lon, heading, point: p0 };
  }, [points, playIndex]);

  // ── Move the car icon to the interpolated position ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource("car") as GeoJSONSource | undefined;
    if (!src) return;

    if (!interpolated) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const feature: Feature<Point> = {
      type: "Feature",
      properties: { heading: interpolated.heading },
      geometry: { type: "Point", coordinates: [interpolated.lon, interpolated.lat] },
    };
    src.setData({ type: "FeatureCollection", features: [feature] });
  }, [interpolated]);

  // ── Animation loop: advance through real recorded time gaps, scaled by speed ──
  useEffect(() => {
    if (!isPlaying || points.length < 2) return;

    let cancelled = false;
    let lastFrameTime = performance.now();
    let currentIndex = playIndex;

    function frame(now: number) {
      if (cancelled) return;
      const dtMs = now - lastFrameTime;
      lastFrameTime = now;

      const i0 = Math.floor(currentIndex);
      if (i0 >= points.length - 1) {
        setIsPlaying(false);
        return;
      }
      const i1 = i0 + 1;
      const segmentDurationMs = Math.max(
        200,
        new Date(points[i1].time).getTime() - new Date(points[i0].time).getTime(),
      );
      currentIndex += (dtMs * speedMultiplier) / segmentDurationMs;

      if (currentIndex >= points.length - 1) {
        setPlayIndex(points.length - 1);
        setIsPlaying(false);
        return;
      }
      setPlayIndex(currentIndex);
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, points, speedMultiplier]);

  const currentTimeLabel = interpolated ? new Date(interpolated.point.time).toLocaleString() : null;
  const canPlay = points.length >= 2;

  return (
    <div className="flex h-full min-h-[600px] w-full flex-col bg-[#0a0c10]">
      {/* Controls: device + time range */}
      <div className="flex flex-wrap items-end gap-3 border-b border-[#1a1f2e] bg-[#0a0c10] p-3">
        <label className="flex flex-col text-[11px] uppercase tracking-wide text-slate-500">
          Device
          <select
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            className="mt-1 rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {devices.length === 0 && <option value="">No devices yet</option>}
            {devices.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-[11px] uppercase tracking-wide text-slate-500">
          From
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>

        <label className="flex flex-col text-[11px] uppercase tracking-wide text-slate-500">
          To
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>

        <button
          onClick={loadPlayback}
          disabled={loading || !imei}
          className="rounded bg-sky-500 px-4 py-1.5 text-xs font-medium text-[#0a0c10] transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load route"}
        </button>

        {currentTimeLabel && (
          <span className="ml-auto font-mono text-xs text-slate-500">
            {currentTimeLabel}
            {interpolated && ` · ${interpolated.point.speed_kph.toFixed(0)} km/h`}
          </span>
        )}
      </div>

      {error && (
        <div className="border-b border-[#1a1f2e] bg-[#0a0c10] px-3 py-2 text-xs text-amber-400">{error}</div>
      )}

      {/* Map */}
      <div ref={containerRef} className="flex-1" />

      {/* Playback transport controls */}
      <div className="flex items-center gap-3 border-t border-[#1a1f2e] bg-[#0a0c10] p-3">
        <button
          onClick={() => setIsPlaying((p) => !p)}
          disabled={!canPlay}
          className="rounded border border-slate-800 bg-slate-900 px-4 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          step={0.01}
          value={playIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setPlayIndex(Number(e.target.value));
          }}
          disabled={!canPlay}
          className="flex-1 accent-sky-500 disabled:opacity-40"
          aria-label="Playback position"
        />

        <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
          Speed
          <select
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
            className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value={1}>1×</option>
            <option value={10}>10×</option>
            <option value={20}>20×</option>
            <option value={60}>60×</option>
            <option value={300}>300×</option>
          </select>
        </label>
      </div>
    </div>
  );
}