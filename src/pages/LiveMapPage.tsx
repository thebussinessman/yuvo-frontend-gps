import LiveMap from "../features/map/LiveMap";
import VehiclesPanel from "../features/vehicles/VehiclesPanel";
import { useLiveVehicles } from "../shared/hooks/useLiveVehicles";

export default function LiveMapPage() {
  const vehicles = useLiveVehicles();
  const moving  = vehicles.filter(v => v.status === "moving").length;
  const stopped = vehicles.filter(v => v.status === "stopped").length;
  const offline = vehicles.filter(v => v.status === "offline").length;

  return (
    <div className="h-full w-full flex">
      <aside className="w-[320px] shrink-0 border-r border-[#1a1f2e]">
        <VehiclesPanel />
      </aside>
      <section className="flex-1 relative">
        <LiveMap />
        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-2 bg-[#0a0c10]/90 backdrop-blur border border-[#1a1f2e] rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
            <span className="text-[11px] font-mono text-slate-300">{moving} moving</span>
            <span className="text-slate-700">·</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>
            <span className="text-[11px] font-mono text-slate-300">{stopped} stopped</span>
            <span className="text-slate-700">·</span>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"/>
            <span className="text-[11px] font-mono text-slate-300">{offline} offline</span>
          </div>
        </div>
        <div className="absolute top-3 right-3 bg-[#0a0c10]/90 backdrop-blur border border-[#1a1f2e] rounded-lg px-3 py-2">
          <span className="text-[11px] font-mono text-slate-400">Lusaka, Zambia</span>
        </div>
        <div className="absolute bottom-6 right-3 bg-[#0a0c10]/90 backdrop-blur border border-[#1a1f2e] rounded-lg px-3 py-2.5 flex flex-col gap-1.5">
          {[
            { color: "bg-emerald-500", label: "Moving"  },
            { color: "bg-amber-500",   label: "Stopped" },
            { color: "bg-red-500",     label: "Offline" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${l.color}`}/>
              <span className="text-[10px] font-mono text-slate-500">{l.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
