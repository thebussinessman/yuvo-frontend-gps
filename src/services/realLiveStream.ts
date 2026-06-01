import { io } from "socket.io-client";
import {
  liveVehiclesStore,
  type LiveVehicle,
  type VehicleStatus,
} from "../store/liveVehicles";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

let connected = false;

export async function startRealLiveStream() {
  if (connected) return;
  connected = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/latest`);

    if (!res.ok) {
      throw new Error(`Failed to load latest positions: ${res.status}`);
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : [];

    const vehicles: LiveVehicle[] = list.map((p: Record<string, unknown>) => ({
      id: String(p.imei),
      name: String(p.imei),
      lat: Number(p.lat),
      lon: Number(p.lon),
      speedKph: Number(p.speed_kph ?? 0),
      heading: Number(p.course ?? 0),
      status: deriveStatus(Number(p.speed_kph ?? 0), String(p.time ?? "")),
      lastUpdate: new Date(String(p.time ?? "")).getTime(),
      battery: typeof p.battery === "number" ? p.battery : undefined,
      satellites: typeof p.satellites === "number" ? p.satellites : undefined,
      distanceKm: 0,
    }));

    liveVehiclesStore.upsertMany(vehicles);
    console.log(`✅ Loaded ${vehicles.length} vehicles from REST API`);
  } catch (err) {
    console.warn("⚠️ Could not load initial positions:", err);
  }

  const socket = io(`${API_BASE_URL}/live`, {
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("🔌 Socket.io connected to backend");
  });

  socket.on("location", (pos: Record<string, unknown>) => {
    const vehicle: LiveVehicle = {
      id: String(pos.imei),
      name: String(pos.imei),
      lat: Number(pos.lat),
      lon: Number(pos.lon),
      speedKph: Number(pos.speedKph ?? pos.speed_kph ?? 0),
      heading: Number(pos.course ?? 0),
      status: deriveStatus(
        Number(pos.speedKph ?? pos.speed_kph ?? 0),
        String(pos.time ?? "")
      ),
      lastUpdate: new Date(String(pos.time ?? "")).getTime(),
      battery: typeof pos.battery === "number" ? pos.battery : undefined,
      satellites:
        typeof pos.satellites === "number" ? pos.satellites : undefined,
      distanceKm: 0,
    };

    liveVehiclesStore.upsert(vehicle);
  });

  socket.on("disconnect", () => {
    connected = false;
    console.warn("🔌 Socket.io disconnected from backend");
  });

  socket.on("connect_error", (err) => {
    connected = false;
    console.warn("⚠️ Socket.io connection error:", err.message);
  });
}

function deriveStatus(speedKph: number, time: string): VehicleStatus {
  const timestamp = new Date(time).getTime();

  if (!timestamp || Number.isNaN(timestamp)) return "offline";

  const ageMs = Date.now() - timestamp;

  if (ageMs > 5 * 60 * 1000) return "offline";
  if (speedKph > 2) return "moving";

  return "stopped";
}