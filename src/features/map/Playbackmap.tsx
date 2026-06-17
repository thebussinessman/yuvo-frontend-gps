import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";

const KEY = import.meta.env.VITE_MAPTILER_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/openstreetmap/style.json?key=${KEY}`;
const LUSAKA_CENTER: [number, number] = [28.2833, -15.4167];

// ─── Car icon SVG factory ──────────────────────────────────────────────────
// Same shape as the one used on the live map. Points north (0°); MapLibre
// rotates it by the `heading` property to match direction of travel.
function makeCarImage(color: string): Promise<HTMLImageElement> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <circle cx="19" cy="19" r="17" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1"/>
    <rect x="13" y="16" width="12" height="13" rx="3" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
    <path d="M13 20 L19 9 L25 20 Z" fill="${color}" stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="11" y="20" width="3" height="5" rx="1.5" fill="#0f172a" opacity="0.85"/>
    <rect x="24" y="20" width="3" height="5" rx="1.5" fill="#0f172a" opacity="0.85"/>
    <rect x="15" y="20" width="8" height="5" rx="1" fill="white" fill-opacity="0.25"/>
  </svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image(38, 38);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlaybackPoint {
  imei: string;
  time: string;
  lat: number;
  lon: number;
  speed_kph: number;
  course: number;
  satellites?: number;
}

interface PlaybackMapProps {
  points: PlaybackPoint[];
  currentIndex: number;
}

type LonLat = { lon: number; lat: number; heading: number };

// ─── Small math helpers ────────────────────────────────────────────────────

function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Shortest-path angle interpolation so the car icon doesn't spin the long
// way around when the heading crosses the 0°/360° boundary.
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

function lineFeature(coords: [number, number][]): Feature<LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
}

function carFeatureCollection(lon: number, lat: number, heading: number): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { heading },
        geometry: { type: "Point", coordinates: [lon, lat] },
      },
    ],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PlaybackMap({ points, currentIndex }: PlaybackMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);

  // Always-current refs so the map "load" handler (captured once, on mount)
  // can see whatever props have arrived by the time it actually fires.
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  const indexRef = useRef(currentIndex);
  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

  // Tracks the car's last drawn position so we can animate smoothly to the
  // next one, and which `points` array we last drew a route for so we only
  // re-fit the map / reset the trail when a genuinely new route is loaded.
  const prevPosRef = useRef<LonLat | null>(null);
  const prevPointsRef = useRef<PlaybackPoint[] | null>(null);
  const animRef = useRef<number | null>(null);

  function drawRoute(pts: PlaybackPoint[]) {
    const map = mapRef.current;
    const src = map?.getSource("route-full") as GeoJSONSource | undefined;
    if (!map || !readyRef.current || !src) return;

    const coords: [number, number][] = pts.map((p) => [p.lon, p.lat]);
    src.setData(lineFeature(coords));

    if (coords.length > 1) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
    } else if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: 15, duration: 600 });
    }
  }

  function setTraveled(pts: PlaybackPoint[], idx: number) {
    const map = mapRef.current;
    const src = map?.getSource("route-traveled") as GeoJSONSource | undefined;
    if (!map || !readyRef.current || !src) return;
    const coords: [number, number][] = pts.slice(0, idx + 1).map((p) => [p.lon, p.lat]);
    src.setData(lineFeature(coords));
  }

  function setCarPosition(lon: number, lat: number, heading: number) {
    const map = mapRef.current;
    const src = map?.getSource("car") as GeoJSONSource | undefined;
    if (!map || !readyRef.current || !src) return;
    src.setData(carFeatureCollection(lon, lat, heading));
  }

  function moveCar(pts: PlaybackPoint[], idx: number, animate: boolean) {
    const cur = pts[idx];
    if (!mapRef.current || !readyRef.current || !cur) return;

    const fallbackHeading = prevPosRef.current
      ? bearing(prevPosRef.current, cur)
      : 0;
    const targetHeading = cur.course ?? fallbackHeading;

    const from = prevPosRef.current;
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    if (!animate || !from) {
      setCarPosition(cur.lon, cur.lat, targetHeading);
      prevPosRef.current = { lon: cur.lon, lat: cur.lat, heading: targetHeading };
      return;
    }

    const duration = 450;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setCarPosition(
        lerp(from.lon, cur.lon, t),
        lerp(from.lat, cur.lat, t),
        lerpAngle(from.heading, targetHeading, t),
      );
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        prevPosRef.current = { lon: cur.lon, lat: cur.lat, heading: targetHeading };
        animRef.current = null;
      }
    };
    animRef.current = requestAnimationFrame(step);
  }

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: LUSAKA_CENTER,
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      void (async () => {
        const img = await makeCarImage("#22d3ee");
        map.addImage("playback-car", img);

        map.addSource("route-full", {
          type: "geojson",
          data: lineFeature([]),
        });
        map.addSource("route-traveled", {
          type: "geojson",
          data: lineFeature([]),
        });
        map.addSource("car", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: "route-full-line",
          type: "line",
          source: "route-full",
          paint: { "line-color": "#334155", "line-width": 3 },
        });
        map.addLayer({
          id: "route-traveled-line",
          type: "line",
          source: "route-traveled",
          paint: { "line-color": "#22d3ee", "line-width": 3.5 },
        });
        map.addLayer({
          id: "car-icon",
          type: "symbol",
          source: "car",
          layout: {
            "icon-image": "playback-car",
            "icon-size": 1,
            "icon-rotate": ["get", "heading"],
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });

        readyRef.current = true;

        // Catch up with whatever props arrived before "load" fired.
        drawRoute(pointsRef.current);
        setTraveled(pointsRef.current, indexRef.current);
        moveCar(pointsRef.current, indexRef.current, false);
        prevPointsRef.current = pointsRef.current;
      })();
    });

    mapRef.current = map;
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever points or the scrub index change: if it's a brand-new route
  // (a different array than last time, e.g. from clicking "Load Route"),
  // redraw the full trail and snap the car to the start with no animation.
  // Otherwise it's just a step/scrub within the same route, so animate the
  // car smoothly to its new position.
  useEffect(() => {
    const isNewRoute = prevPointsRef.current !== points;
    if (isNewRoute) {
      prevPosRef.current = null;
      drawRoute(points);
    }
    setTraveled(points, currentIndex);
    moveCar(points, currentIndex, !isNewRoute);
    prevPointsRef.current = points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, currentIndex]);ss

  return <div ref={containerRef} className="h-full w-full" />;
}