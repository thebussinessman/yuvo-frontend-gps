import { io } from "socket.io-client";
import {
  liveVehiclesStore,
  type LiveVehicle,
  type VehicleStatus,
} from "../store/liveVehicles";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

let connected = false;

// ─── Mock / demo mode ─────────────────────────────────────────────────────────
// Activated automatically when the real backend is unreachable.

type MockState = {
  imei: string;
  lat: number;
  lon: number;
  speedKph: number;
  course: number;
  battery: number;
  satellites: number;
};

const MOCK_FLEET: MockState[] = [
  { imei: "DEMO-TRUCK-01", lat: -15.4167, lon: 28.2833, speedKph: 54, course: 90,  battery: 82, satellites: 9 },
  { imei: "DEMO-VAN-02",   lat: -15.4250, lon: 28.3200, speedKph: 0,  course: 180, battery: 47, satellites: 7 },
  { imei: "DEMO-CAR-03",   lat: -15.3900, lon: 28.3100, speedKph: 38, course: 270, battery: 91, satellites: 11 },
  { imei: "DEMO-BIKE-04",  lat: -15.4600, lon: 28.2600, speedKph: 22, course: 45,  battery: 23, satellites: 6 },
];

let mockTimer: ReturnType<typeof setInterval> | null = null;

function mockToVehicle(m: MockState): LiveVehicle {
  return {
    id:         m.imei,
    name:       m.imei,
    lat:        m.lat,
    lon:        m.lon,
    speedKph:   m.speedKph,
    heading:    m.course,
    status:     m.speedKph > 2 ? "moving" : "stopped",
    lastUpdate: Date.now(),
    battery:    m.battery,
    satellites: m.satellites,
    distanceKm: 0,
  };
}

function startMockMode() {
  console.info(
    "📡 Backend unreachable — demo mode active (mock vehicles shown on map)"
  );

  const fleet = MOCK_FLEET.map((v) => ({ ...v }));
  liveVehiclesStore.upsertMany(fleet.map(mockToVehicle));

  if (mockTimer) return;

  mockTimer = setInterval(() => {
    fleet.forEach((v) => {
      if (v.speedKph > 0) {
        const rad = (v.course * Math.PI) / 180;
        v.lat += Math.cos(rad) * 0.00025 + (Math.random() - 0.5) * 0.00008;
        v.lon += Math.sin(rad) * 0.00025 + (Math.random() - 0.5) * 0.00008;
      }

      // Occasionally change speed / direction
      if (Math.random() < 0.08) {
        v.speedKph = v.speedKph > 0 ? 0 : 20 + Math.random() * 70;
        v.course   = Math.round(Math.random() * 360);
      }

      // Slowly drain battery
      if (v.battery > 5) v.battery -= Math.random() < 0.05 ? 1 : 0;

      // Satellite count drifts slightly
      v.satellites = Math.max(4, Math.min(12, v.satellites + (Math.random() < 0.1 ? (Math.random() < 0.5 ? 1 : -1) : 0)));
    });

    liveVehiclesStore.upsertMany(fleet.map(mockToVehicle));
  }, 2500);
}

// ─── Real stream ──────────────────────────────────────────────────────────────

export async function startRealLiveStream() {
  if (connected) return;
  connected = true;

  // 1. Seed from REST
  let backendReachable = false;
  try {
    const res = await fetch(`${API_BASE_URL}/api/latest`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const list = Array.isArray(data) ? data : [];

    const vehicles: LiveVehicle[] = list.map((p: Record<string, unknown>) => ({
      id:         String(p.imei),
      name:       String(p.imei),
      lat:        Number(p.lat),
      lon:        Number(p.lon),
      speedKph:   Number(p.speed_kph ?? 0),
      heading:    Number(p.course ?? 0),
      status:     deriveStatus(Number(p.speed_kph ?? 0), String(p.time ?? "")),
      lastUpdate: new Date(String(p.time ?? "")).getTime(),
      battery:    typeof p.battery    === "number" ? p.battery    : undefined,
      satellites: typeof p.satellites === "number" ? p.satellites : undefined,
      distanceKm: 0,
    }));

    liveVehiclesStore.upsertMany(vehicles);
    backendReachable = true;
    console.log(`✅ Loaded ${vehicles.length} vehicles from backend`);
  } catch {
    startMockMode();
  }

  // 2. Connect socket — limit retries so we don't flood the console
  const socket = io(`${API_BASE_URL}/live`, {
    transports:          ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay:    4000,
    reconnectionDelayMax: 10000,
  });

  socket.on("connect", () => {
    backendReachable = true;
    // Stop mock mode if socket reconnects after a failure
    if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
    console.log("🔌 Socket.io connected");
  });

  socket.on("location", (pos: Record<string, unknown>) => {
    const vehicle: LiveVehicle = {
      id:         String(pos.imei),
      name:       String(pos.imei),
      lat:        Number(pos.lat),
      lon:        Number(pos.lon),
      speedKph:   Number(pos.speedKph ?? pos.speed_kph ?? 0),
      heading:    Number(pos.course ?? 0),
      status:     deriveStatus(
                    Number(pos.speedKph ?? pos.speed_kph ?? 0),
                    String(pos.time ?? "")
                  ),
      lastUpdate: new Date(String(pos.time ?? "")).getTime(),
      battery:    typeof pos.battery    === "number" ? pos.battery    : undefined,
      satellites: typeof pos.satellites === "number" ? pos.satellites : undefined,
      distanceKm: 0,
    };
    liveVehiclesStore.upsert(vehicle);
  });

  socket.on("disconnect", () => {
    connected = false;
    if (!backendReachable) startMockMode();
  });

  // After max retries are exhausted, silently fall back to mock mode
  socket.on("reconnect_failed", () => {
    connected = false;
    console.info("📡 Socket reconnect failed — staying in demo mode");
    startMockMode();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveStatus(speedKph: number, time: string): VehicleStatus {
  const ts = new Date(time).getTime();
  if (!ts || Number.isNaN(ts)) return "offline";
  if (Date.now() - ts > 5 * 60 * 1000) return "offline";
  return speedKph > 2 ? "moving" : "stopped";
}
