import { liveVehiclesStore, type LiveVehicle } from "../store/liveVehicles";

// Lusaka-ish starting area (you can change)
const BASE_LAT = -15.4167;
const BASE_LON = 28.2833;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function makeVehicle(i: number): LiveVehicle {
  const lat = BASE_LAT + rand(-0.03, 0.03);
  const lon = BASE_LON + rand(-0.03, 0.03);

  return {
    id: `V${i}`,
    name: `Vehicle ${String(i).padStart(2, "0")}`,
    lat,
    lon,
    speedKph: Math.floor(rand(0, 85)),
    heading: Math.floor(rand(0, 360)),
    status: "moving",
    lastUpdate: Date.now(),
    distanceKm: 0,
  };
}

let timer: number | null = null;

export function startMockLiveStream(count = 25) {
  // seed
  const initial = Array.from({ length: count }, (_, idx) => makeVehicle(idx + 1));
  liveVehiclesStore.upsertMany(initial);

  // update every second
  timer = window.setInterval(() => {
    const now = Date.now();
    const list = liveVehiclesStore.getAll();

    for (const v of list) {
      // Randomly simulate offline
      const offlineChance = 0.02;
      const stoppedChance = 0.10;

      let status: LiveVehicle["status"] = v.status;

      if (Math.random() < offlineChance) status = "offline";
      else if (Math.random() < stoppedChance) status = "stopped";
      else status = "moving";

      const speed =
        status === "moving"
          ? Math.floor(rand(20, 95))
          : status === "stopped"
          ? 0
          : 0;

      // Very small movement per tick
      const step = status === "moving" ? rand(0.00015, 0.00055) : 0;
      const heading =
        status === "moving"
          ? (v.heading + rand(-15, 15) + 360) % 360
          : v.heading;

      // Convert heading to dx/dy approx, good enough for demo
      const rad = (heading * Math.PI) / 180;
      const dLat = step * Math.cos(rad);
      const dLon = step * Math.sin(rad);

      liveVehiclesStore.upsert({
        ...v,
        lat: v.lat + dLat,
        lon: v.lon + dLon,
        heading: Math.floor(heading),
        speedKph: speed,
        status,
        lastUpdate: now,
        distanceKm: v.distanceKm ?? 0,
      });
    }
  }, 1000);
}

export function stopMockLiveStream() {
  if (timer) window.clearInterval(timer);
  timer = null;
}