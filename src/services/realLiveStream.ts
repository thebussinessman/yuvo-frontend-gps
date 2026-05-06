import { io } from "socket.io-client";
import { liveVehiclesStore, type LiveVehicle, type VehicleStatus } from "../store/liveVehicles";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
let connected = false;

export async function startRealLiveStream() {
  if (connected) return;
  connected = true;

  try {
    const res = await fetch(`${BACKEND_URL}/api/latest`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    const vehicles: LiveVehicle[] = list.map((p: any) => ({
      id:         p.imei,
      name:       p.imei,
      lat:        p.lat,
      lon:        p.lon,
      speedKph:   p.speed_kph ?? 0,
      heading:    p.course ?? 0,
      status:     deriveStatus(p.speed_kph ?? 0, p.time),
      lastUpdate: new Date(p.time).getTime(),
    }));
    liveVehiclesStore.upsertMany(vehicles);
    console.log(`✅ Loaded ${vehicles.length} vehicles from REST API`);
  } catch (err) {
    console.warn("⚠️ Could not load initial positions:", err);
  }

  const socket = io(`${BACKEND_URL}/live`, { transports: ["websocket"] });
  socket.on("connect", () => console.log("🔌 Socket.io connected to backend"));
  socket.on("location", (pos: any) => {
    const vehicle: LiveVehicle = {
      id:         pos.imei,
      name:       pos.imei,
      lat:        pos.lat,
      lon:        pos.lon,
      speedKph:   pos.speedKph ?? 0,
      heading:    pos.course ?? 0,
      status:     deriveStatus(pos.speedKph ?? 0, pos.time),
      lastUpdate: new Date(pos.time).getTime(),
    };
    liveVehiclesStore.upsert(vehicle);
  });
  socket.on("disconnect", () => { connected = false; });
}

function deriveStatus(speedKph: number, time: string): VehicleStatus {
  const ageMs = Date.now() - new Date(time).getTime();
  if (ageMs > 5 * 60 * 1000) return "offline";
  if (speedKph > 2) return "moving";
  return "stopped";
}
