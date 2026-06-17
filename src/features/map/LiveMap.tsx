import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";

import { useLiveVehicles } from "../../shared/hooks/useLiveVehicles";
import { startRealLiveStream } from "../../services/realLiveStream";

const KEY = import.meta.env.VITE_MAPTILER_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/openstreetmap/style.json?key=${KEY}`;

// ─── Car icon SVG factory ─────────────────────────────────────────────────────
// Points north (0°). MapLibre rotates it by `heading` to match direction of travel.

function makeCarImage(color: string): Promise<HTMLImageElement> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <circle cx="19" cy="19" r="17" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1"/>
    <!-- body -->
    <rect x="13" y="16" width="12" height="13" rx="3" fill="${color}" stroke="#0f172a" stroke-width="1.5"/>
    <!-- hood/front pointing north -->
    <path d="M13 20 L19 9 L25 20 Z" fill="${color}" stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round"/>
    <!-- left wheel -->
    <rect x="11" y="20" width="3" height="5" rx="1.5" fill="#0f172a" opacity="0.85"/>
    <!-- right wheel -->
    <rect x="24" y="20" width="3" height="5" rx="1.5" fill="#0f172a" opacity="0.85"/>
    <!-- windshield -->
    <rect x="15" y="20" width="8" height="5" rx="1" fill="white" fill-opacity="0.25"/>
  </svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image(38, 38);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LiveMapProps {
  selectedId?: string;
  onVehicleClick?: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveMap({ selectedId, onVehicleClick }: LiveMapProps = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Keep refs so the map init closure doesn't capture stale values
  const onVehicleClickRef = useRef(onVehicleClick);
  useEffect(() => { onVehicleClickRef.current = onVehicleClick; }, [onVehicleClick]);

  // Seed positions from REST + connect socket
  useEffect(() => { startRealLiveStream(); }, []);

  const vehicles = useLiveVehicles();

  const geojson: FeatureCollection<Point> = useMemo(() => ({
    type: "FeatureCollection",
    features: vehicles.map((v) => ({
      type: "Feature",
      properties: {
        id:         v.id,
        name:       v.name,
        speedKph:   v.speedKph,
        status:     v.status,
        heading:    v.heading,
        lastUpdate: v.lastUpdate,
      },
      geometry: { type: "Point", coordinates: [v.lon, v.lat] },
    })),
  }), [vehicles]);

  // Always-current ref to the latest geojson, so the map "load" handler below
  // (captured once, on mount) can read whatever data has arrived by the time
  // it actually fires, instead of being stuck with an empty snapshot from
  // when the effect closure was first created.
  const geojsonRef = useRef(geojson);
  useEffect(() => { geojsonRef.current = geojson; }, [geojson]);

  // Init map once
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
        // Load car images for each status
        const iconDefs: [string, string][] = [
          ["car-moving",  "#22d3ee"],
          ["car-stopped", "#f59e0b"],
          ["car-offline", "#ef4444"],
        ];
        await Promise.all(
          iconDefs.map(async ([name, color]) => {
            const img = await makeCarImage(color);
            map.addImage(name, img);
          }),
        );

        // Seed with whatever vehicle data has already arrived (e.g. from the
        // initial REST snapshot) instead of starting empty and waiting for
        // the next live update before anything shows on the map.
        map.addSource("vehicles", { type: "geojson", data: geojsonRef.current });

        // Selection ring — behind the icon
        map.addLayer({
          id: "vehicles-ring",
          type: "circle",
          source: "vehicles",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-radius": 22,
            "circle-color": "transparent",
            "circle-stroke-color": "#22d3ee",
            "circle-stroke-width": 2.5,
            "circle-stroke-opacity": 0.9,
          },
        });

        // Car icons, rotated by heading
        map.addLayer({
          id: "vehicles-icons",
          type: "symbol",
          source: "vehicles",
          layout: {
            "icon-image": [
              "match", ["get", "status"],
              "moving",  "car-moving",
              "stopped", "car-stopped",
              "offline", "car-offline",
              "car-stopped",
            ],
            "icon-size": 1,
            "icon-rotate": ["get", "heading"],
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });

        // Vehicle name labels
        map.addLayer({
          id: "vehicles-labels",
          type: "symbol",
          source: "vehicles",
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 2],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#e2e8f0",
            "text-halo-color": "#0f172a",
            "text-halo-width": 1.5,
          },
        });

        // Click on a car icon → callback
        map.on("click", "vehicles-icons", (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) onVehicleClickRef.current?.(id);
        });

        map.on("mouseenter", "vehicles-icons", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "vehicles-icons", () => {
          map.getCanvas().style.cursor = "";
        });
      })();
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update GeoJSON data when vehicles change
  useEffect(() => {
    const src = mapRef.current?.getSource("vehicles") as GeoJSONSource | undefined;
    src?.setData(geojson);
  }, [geojson]);

  // Update selection ring filter when selectedId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("vehicles-ring")) return;
    map.setFilter(
      "vehicles-ring",
      selectedId ? ["==", ["get", "id"], selectedId] : ["==", ["get", "id"], ""],
    );
  }, [selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
