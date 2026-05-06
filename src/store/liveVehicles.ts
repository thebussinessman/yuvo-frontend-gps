export type VehicleStatus = "moving" | "stopped" | "offline";

export type LiveVehicle = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  speedKph: number;
  heading: number;
  status: VehicleStatus;
  lastUpdate: number; // epoch ms
};

type Listener = () => void;

class LiveVehiclesStore {
  private vehicles = new Map<string, LiveVehicle>();
  private listeners = new Set<Listener>();

  getAll(): LiveVehicle[] {
    return Array.from(this.vehicles.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  getById(id: string) {
    return this.vehicles.get(id);
  }

  upsert(v: LiveVehicle) {
    this.vehicles.set(v.id, v);
    this.emit();
  }

  upsertMany(list: LiveVehicle[]) {
    for (const v of list) this.vehicles.set(v.id, v);
    this.emit();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export const liveVehiclesStore = new LiveVehiclesStore();
