import { useSyncExternalStore } from "react";
import { liveVehiclesStore } from "../../store/liveVehicles";

export function useLiveVehicles() {
  return useSyncExternalStore(
    liveVehiclesStore.subscribe,
    liveVehiclesStore.getSnapshot,
    liveVehiclesStore.getSnapshot
  );
}