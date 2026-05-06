import { useSyncExternalStore } from "react";
import { liveVehiclesStore } from "../../store/liveVehicles";

export function useLiveVehicles() {
  return useSyncExternalStore(
    (cb) => liveVehiclesStore.subscribe(cb),
    () => liveVehiclesStore.getAll(),
    () => liveVehiclesStore.getAll()
  );
}
