import { useMemo, useState } from "react";
import { useLiveVehicles } from "../../shared/hooks/useLiveVehicles";
import type { LiveVehicle } from "../../store/liveVehicles";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function StatusBadge({ status }: { status: LiveVehicle["status"] }) {
  const cfg = {
    moving:  { color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", dot: "bg-emerald-400", label: "Moving"  },
    stopped: { color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/20",     dot: "bg-amber-400",   label: "Stopped" },
    offline: { color: "text-red-400",     bg: "bg-red-400/10 border-red-400/20",         dot: "bg-red-400",     label: "Offline" },
  }[status] ?? { color: "text-slate-400", bg: "bg-slate-400/10 border-slate-400/20", dot: "bg-slate-400", label: "Unknown" };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot}`}/>
      {cfg.label}
    </span>
  );
}

function VehicleCard({ v }: { v: LiveVehicle }) {
  const compassDir = (deg: number) => ["N","NE","E","SE","S","SW","W","NW"][Math.round((deg ?? 0) / 45) % 8];
  return (
    <div className="px-4 py-3 border-b border-[#111520] hover:bg-[#0d1018] transition-colors duration-100 cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`shrink-0 w-1 h-8 rounded-full ${v.status === "moving" ? "bg-emerald-500" : v.status === "stopped" ? "bg-amber-500" : "bg-red-500/50"}`}/>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{v.name}</div>
            <div className="text-[10px] text-slate-600 font-mono mt-0.5">{v.id}</div>
          </div>
        </div>
        <StatusBadge status={v.status}/>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {[
          { label: "Speed",   value: `${v.speedKph ?? 0}`,               unit: "km/h" },
          { label: "Heading", value: compassDir(v.heading ?? 0),          unit: `${v.heading ?? 0}°` },
          { label: "Updated", value: timeAgo(v.lastUpdate ?? Date.now()), unit: "" },
        ].map((m) => (
          <div key={m.label} className="bg-[#0a0c10] rounded p-2 border border-[#1a1f2e]">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider">{m.label}</div>
            <div className="text-sm font-medium text-slate-200 mt-0.5 font-mono">{m.value}<span className="text-[9px] text-slate-600 ml-0.5">{m.unit}</span></div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[10px] text-slate-600 font-mono">{(v.lat ?? 0).toFixed(6)}, {(v.lon ?? 0).toFixed(6)}</div>
    </div>
  );
}

export default function VehiclesPanel() {
  const vehicles = useLiveVehicles();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all"|"moving"|"stopped"|"offline">("all");

  const counts = useMemo(() => ({
    all:     vehicles.length,
    moving:  vehicles.filter(v => v.status === "moving").length,
    stopped: vehicles.filter(v => v.status === "stopped").length,
    offline: vehicles.filter(v => v.status === "offline").length,
  }), [vehicles]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return vehicles.filter(v => {
      const matchSearch = !s || (v.name ?? "").toLowerCase().includes(s) || (v.id ?? "").toLowerCase().includes(s);
      const matchFilter = filter === "all" || v.status === filter;
      return matchSearch && matchFilter;
    });
  }, [vehicles, q, filter]);

  return (
    <div className="h-full flex flex-col bg-[#0a0c10]">
      <div className="px-4 pt-4 pb-3 border-b border-[#1a1f2e] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Vehicles</span>
          <span className="text-xs font-mono text-sky-400 bg-sky-400/10 border border-sky-400/20 px-2 py-0.5 rounded">{counts.all} total</span>
        </div>
        <div className="relative mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or IMEI..."
            className="w-full bg-[#0d1018] border border-[#1a1f2e] rounded-lg pl-3 pr-3 py-2 text-xs text-slate-300 placeholder-slate-700 outline-none focus:border-sky-500/40 transition-colors font-mono"/>
        </div>
        <div className="flex gap-1.5">
          {([
            { id: "all",     label: "All",     count: counts.all },
            { id: "moving",  label: "Moving",  count: counts.moving },
            { id: "stopped", label: "Stopped", count: counts.stopped },
            { id: "offline", label: "Offline", count: counts.offline },
          ] as const).map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`flex-1 text-[10px] font-medium py-1 px-1 rounded border transition-all font-mono
                ${filter === f.id
                  ? f.id === "moving"  ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                  : f.id === "stopped" ? "text-amber-400 bg-amber-400/10 border-amber-400/30"
                  : f.id === "offline" ? "text-red-400 bg-red-400/10 border-red-400/30"
                  : "text-sky-400 bg-sky-400/10 border-sky-400/30"
                  : "text-slate-600 bg-transparent border-[#1a1f2e] hover:text-slate-400"}`}>
              {f.label} <span className="opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <div className="text-slate-700 text-2xl">◎</div>
            <div className="text-xs text-slate-600">No vehicles found</div>
          </div>
        ) : filtered.map((v) => <VehicleCard key={v.id} v={v}/>)}
      </div>
      <div className="shrink-0 border-t border-[#1a1f2e] px-4 py-2.5 grid grid-cols-3 gap-2">
        {[
          { count: counts.moving,  color: "text-emerald-400", label: "Moving"  },
          { count: counts.stopped, color: "text-amber-400",   label: "Stopped" },
          { count: counts.offline, color: "text-red-400",     label: "Offline" },
        ].map((s, i) => (
          <div key={s.label} className={`text-center ${i === 1 ? "border-x border-[#1a1f2e]" : ""}`}>
            <div className={`text-sm font-semibold font-mono ${s.color}`}>{s.count}</div>
            <div className="text-[9px] text-slate-600 uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
