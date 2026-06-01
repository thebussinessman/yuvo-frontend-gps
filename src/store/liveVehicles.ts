export type VehicleStatus = "moving" | "stopped" | "offline";

export type LiveVehicle = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  speedKph: number;
  heading: number;
  status: VehicleStatus;
  lastUpdate: number;
  battery?: number;    // 0-100, undefined when tracker doesn't report it
  satellites?: number;
  distanceKm: number;  // accumulated this session
};

type Listener = () => void;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class LiveVehiclesStore {
  private vehicles = new Map<string, LiveVehicle>();
  private listeners = new Set<Listener>();
  private snapshot: LiveVehicle[] = [];

  getSnapshot = (): LiveVehicle[] => this.snapshot;

  getAll(): LiveVehicle[] { return this.snapshot; }

  getById(id: string) { return this.vehicles.get(id); }

  upsert(v: LiveVehicle) {
    const prev = this.vehicles.get(v.id);
    const delta =
      prev && (prev.lat !== v.lat || prev.lon !== v.lon)
        ? haversineKm(prev.lat, prev.lon, v.lat, v.lon)
        : 0;
    this.vehicles.set(v.id, { ...v, distanceKm: (prev?.distanceKm ?? 0) + delta });
    this.rebuildSnapshot();
    this.emit();
  }

  upsertMany(list: LiveVehicle[]) {
    for (const v of list) {
      const prev = this.vehicles.get(v.id);
      const delta =
        prev && (prev.lat !== v.lat || prev.lon !== v.lon)
          ? haversineKm(prev.lat, prev.lon, v.lat, v.lon)
          : 0;
      this.vehicles.set(v.id, { ...v, distanceKm: (prev?.distanceKm ?? 0) + delta });
    }
    this.rebuildSnapshot();
    this.emit();
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private rebuildSnapshot() {
    this.snapshot = Array.from(this.vehicles.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export const liveVehiclesStore = new LiveVehiclesStore();
