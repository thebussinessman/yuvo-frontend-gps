import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map, Marker } from 'maplibre-gl';
import axios from 'axios';

type Vehicle = {
  imei: string;
  lat: number;
  lon: number;
  speed_kph?: number;
};

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const [mapReady, setMapReady] = useState(false);

  // 1️⃣ Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [28.283333, -15.416667],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      console.log('🗺️ map fully loaded');
      setMapReady(true);
      map.resize();
    });

    mapRef.current = map;
  }, []);

  // 2️⃣ Fetch vehicles ONLY after map is ready
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const fetchVehicles = async () => {
      const res = await axios.get<Vehicle[]>(
        'http://localhost:3000/api/latest'
      );

      console.log('🚗 vehicles:', res.data);

      if (res.data.length === 0) return;

      const first = res.data[0];

      mapRef.current!.flyTo({
        center: [first.lon, first.lat],
        zoom: 13,
      });

      res.data.forEach((v) => {
        if (!markersRef.current[v.imei]) {
          const el = document.createElement('div');
          el.style.width = '24px';
          el.style.height = '24px';
          el.style.background = 'red';
          el.style.borderRadius = '50%';
          el.style.border = '4px solid yellow';
          el.style.boxShadow = '0 0 15px rgba(0,0,0,0.6)';
          el.innerText = '🚗';

          const marker = new maplibregl.Marker(el)
            .setLngLat([v.lon, v.lat])
            .addTo(mapRef.current!);

          markersRef.current[v.imei] = marker;
        } else {
          markersRef.current[v.imei].setLngLat([v.lon, v.lat]);
        }
      });
    };

    fetchVehicles();
    const interval = setInterval(fetchVehicles, 5000);

    return () => clearInterval(interval);
  }, [mapReady]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
      }}
    />
  );
}

