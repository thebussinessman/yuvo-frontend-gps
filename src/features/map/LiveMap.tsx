import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";

import { useLiveVehicles } from "../../shared/hooks/useLiveVehicles";
import { startRealLiveStream } from "../../services/realLiveStream";


const KEY = import.meta.env.VITE_MAPTILER_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/openstreetmap/style.json?key=${KEY}`;





export default function LiveMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Start mock live positions once (remove later when you connect real backend)
  useEffect(() => {
    startRealLiveStream();
  }, []);

  const vehicles = useLiveVehicles();

  // ✅ Properly typed GeoJSON FeatureCollection<Point>
  const geojson: FeatureCollection<Point> = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: vehicles.map((v) => ({
        type: "Feature",
        properties: {
          id: v.id,
          name: v.name,
          speedKph: v.speedKph,
          status: v.status,
          heading: v.heading,
          lastUpdate: v.lastUpdate,
        },
        geometry: {
          type: "Point",
          coordinates: [v.lon, v.lat],
        },
      })),
    };
  }, [vehicles]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [28.2833, -15.4167], // Lusaka-ish
      zoom: 11.5,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      // ✅ This won't redline now
      map.addSource("vehicles", {
        type: "geojson",
        data: geojson,
      });

      // Dots
      map.addLayer({
        id: "vehicles-circles",
        type: "circle",
        source: "vehicles",
        paint: {
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0f172a",
          "circle-color": [
            "match",
            ["get", "status"],
            "moving",
            "#22c55e",
            "stopped",
            "#f59e0b",
            "offline",
            "#ef4444",
            "#60a5fa",
          ],
        },
      });

      // Names
      map.addLayer({
        id: "vehicles-labels",
        type: "symbol",
        source: "vehicles",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#f8fafc",
          "text-halo-width": 1.2,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // We intentionally exclude geojson from deps so the map doesn't re-init on every update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update GeoJSON source when vehicles change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource("vehicles") as GeoJSONSource | undefined;
    if (src) {
      src.setData(geojson);
    }
  }, [geojson]);

  return <div ref={containerRef} className="h-full w-full" />;
}
