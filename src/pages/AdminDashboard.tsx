import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  FileText,
  Gauge,
  LocateFixed,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  PlayCircle,
  RefreshCw,
  Battery,
  Radio,
  Route,
  Router,
  Search,
  Settings,
  Truck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import DevicesPage from './DevicesPage';
import UsersPage from './UsersPage';
import LiveMap from '../features/map/LiveMap';
import { useLiveVehicles } from '../shared/hooks/useLiveVehicles';
import type { LiveVehicle } from '../store/liveVehicles';

/**
 * YUVO GPS — Full Admin Dashboard
 * File: src/pages/AdminDashboard.tsx
 *
 * Pages: Dashboard | Live Tracking | Playback | Devices | Reports | Settings
 *
 * API endpoints (NestJS):
 *   GET /api/latest
 *   GET /api/latest/:imei
 *   GET /api/playback?imei=<imei>&from=<ISO>&to=<ISO>
 *
 * Vite .env:
 *   VITE_API_URL=http://localhost:3000
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const OFFLINE_AFTER_MS = 5 * 60 * 1000;
const REFRESH_EVERY_MS = 10_000;
const MOVING_SPEED_KPH = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = 'dashboard' | 'tracking' | 'playback' | 'devices' | 'users' | 'reports' | 'settings';
type PositionStatus = 'moving' | 'parked' | 'offline';

type LatestPosition = {
  imei: string;
  time: string;
  lat: number;
  lon: number;
  speed_kph: number;
  course: number;
  satellites: number;
};

type FleetPosition = LatestPosition & {
  status: PositionStatus;
  lastSeenLabel: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusStyles: Record<PositionStatus, string> = {
  moving: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  parked: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  offline: 'bg-red-500/15 text-red-300 border-red-500/25',
};

function minutesSince(time: string): number {
  const ts = new Date(time).getTime();
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - ts) / 60_000));
}

function getStatus(p: LatestPosition): PositionStatus {
  const age = Date.now() - new Date(p.time).getTime();
  if (!Number.isFinite(age) || age > OFFLINE_AFTER_MS) return 'offline';
  return p.speed_kph > MOVING_SPEED_KPH ? 'moving' : 'parked';
}

function formatLastSeen(time: string): string {
  const m = minutesSince(time);
  if (!Number.isFinite(m)) return 'Unknown';
  if (m < 1) return 'Just now';
  if (m === 1) return '1 min ago';
  if (m < 60) return `${m} mins ago`;
  const h = Math.floor(m / 60);
  return `${h} hr${h === 1 ? '' : 's'} ago`;
}

function formatDateTime(time: string): string {
  const d = new Date(time);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
}

async function getLatestPositions(signal?: AbortSignal): Promise<LatestPosition[]> {
  const res = await fetch(`${API_URL}/api/latest`, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}${body ? `: ${body}` : ''}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid fleet response from API.');
  return data as LatestPosition[];
}

async function getPlayback(
  imei: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<LatestPosition[]> {
  const params = new URLSearchParams({ imei, from, to });
  const res = await fetch(`${API_URL}/api/playback?${params}`, { signal });
  if (!res.ok) throw new Error(`Playback API error ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid playback response from API.');
  return data as LatestPosition[];
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${accent}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function MapPlaceholder({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="relative flex h-full min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'linear-gradient(#22d3ee 1px,transparent 1px),linear-gradient(90deg,#22d3ee 1px,transparent 1px)',
          backgroundSize: '30px 30px',
        }}
      />
      <div className="z-10 text-center">
        <MapPin className="mx-auto mb-3 text-cyan-400" size={40} />
        <p className="font-medium text-white">{label}</p>
        {sub && <p className="mt-1 text-sm text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
      <AlertTriangle size={18} />
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ─── Page: Dashboard ──────────────────────────────────────────────────────────

function DashboardPage({
  fleet,
  loading,
  error,
  query,
  setQuery,
  selectedImei,
  setSelectedImei,
  lastSync,
  refreshing,
  onRefresh,
}: {
  fleet: FleetPosition[];
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (v: string) => void;
  selectedImei: string | null;
  setSelectedImei: (v: string) => void;
  lastSync: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? fleet.filter(v => v.imei.toLowerCase().includes(q)) : fleet;
  }, [fleet, query]);

  const moving = fleet.filter(v => v.status === 'moving').length;
  const parked = fleet.filter(v => v.status === 'parked').length;
  const offline = fleet.filter(v => v.status === 'offline').length;
  const online = fleet.length - offline;

  const chartData = [
    { name: 'Moving', value: moving, fill: '#06b6d4' },
    { name: 'Parked', value: parked, fill: '#f59e0b' },
    { name: 'Offline', value: offline, fill: '#ef4444' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Admin Dashboard</h2>
          <p className="mt-1 text-sm text-slate-400">Real-time GPS tracker monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400 sm:flex">
            <Clock3 size={13} />
            {lastSync ? `Synced ${lastSync.toLocaleTimeString()}` : 'Not synced'}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && <SectionError message={error} />}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Tracked Devices" value={fleet.length} icon={Truck} accent="bg-indigo-500/15 text-indigo-300" />
        <StatCard title="Online" value={online} icon={Wifi} accent="bg-emerald-500/15 text-emerald-300" />
        <StatCard title="Moving" value={moving} icon={Navigation} accent="bg-cyan-500/15 text-cyan-300" />
        <StatCard title="Offline" value={offline} icon={WifiOff} accent="bg-red-500/15 text-red-300" />
      </div>

      {/* Map + donut */}
      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <LiveMap />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-1 text-lg font-semibold text-white">Device Status</h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={4}>
                  {chartData.map(item => <Cell key={item.name} fill={item.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fleet table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 p-5">
          <div>
            <h3 className="text-lg font-semibold text-white">Latest Positions</h3>
            <p className="text-sm text-slate-400">Data from GET /api/latest</p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2">
            <Search size={15} className="text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search IMEI"
              className="bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>
        </div>
        {loading ? (
          <p className="p-10 text-center text-slate-400">Loading positions…</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-slate-400">No tracker positions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-5 py-4">IMEI</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Speed</th>
                  <th className="px-5 py-4">Coordinates</th>
                  <th className="px-5 py-4">Heading</th>
                  <th className="px-5 py-4">Last Update</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr
                    key={v.imei}
                    onClick={() => setSelectedImei(v.imei)}
                    className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800/50 ${selectedImei === v.imei ? 'bg-slate-800/70' : ''}`}
                  >
                    <td className="px-5 py-4 font-medium text-white">{v.imei}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-3 py-1 text-xs capitalize ${statusStyles[v.status]}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      <span className="flex items-center gap-1"><Gauge size={14} />{v.speed_kph.toFixed(0)} km/h</span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-300">
                      {v.lat.toFixed(5)}, {v.lon.toFixed(5)}
                    </td>
                    <td className="px-5 py-4 text-slate-300">{v.course.toFixed(0)}°</td>
                    <td className="px-5 py-4">
                      <p className="text-slate-300">{v.lastSeenLabel}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(v.time)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vehicle detail card ──────────────────────────────────────────────────────

function VehicleDetailCard({ vehicle, live }: { vehicle: FleetPosition; live?: LiveVehicle }) {
  const iconColor =
    vehicle.status === 'moving' ? '#22d3ee' :
    vehicle.status === 'parked' ? '#f59e0b' : '#ef4444';
  const battPct = live?.battery;
  const distKm = live?.distanceKm ?? 0;
  const isOnline = vehicle.status !== 'offline';

  return (
    <div className="overflow-hidden rounded-xl border border-cyan-500/20 bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-800">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 10L7 4H17L19 10" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="3" y="10" width="18" height="9" rx="2" fill={iconColor} fillOpacity="0.15" stroke={iconColor} strokeWidth="1.5"/>
            <circle cx="7.5" cy="20" r="1.5" fill={iconColor}/>
            <circle cx="16.5" cy="20" r="1.5" fill={iconColor}/>
            <rect x="9" y="10" width="6" height="4" rx="1" fill={iconColor} fillOpacity="0.3"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold text-white">{vehicle.imei}</p>
          <span className={`text-xs capitalize ${
            vehicle.status === 'moving' ? 'text-cyan-400' :
            vehicle.status === 'parked' ? 'text-amber-400' : 'text-red-400'
          }`}>{vehicle.status}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-xs text-slate-400">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-px bg-slate-800">
        <div className="bg-slate-900 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Gauge size={12} className="text-slate-500" />
            <span className="text-xs text-slate-500">Speed</span>
          </div>
          <p className="text-sm font-semibold text-white">
            {vehicle.speed_kph.toFixed(0)}<span className="ml-1 text-xs font-normal text-slate-400">km/h</span>
          </p>
        </div>

        <div className="bg-slate-900 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Navigation size={12} className="text-slate-500" />
            <span className="text-xs text-slate-500">Heading</span>
          </div>
          <p className="text-sm font-semibold text-white">
            {vehicle.course.toFixed(0)}<span className="text-xs font-normal text-slate-400">°</span>
          </p>
        </div>

        <div className="bg-slate-900 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Radio size={12} className="text-slate-500" />
            <span className="text-xs text-slate-500">Satellites</span>
          </div>
          <p className="text-sm font-semibold text-white">
            {vehicle.satellites != null ? (
              <>
                {vehicle.satellites}
                <span className={`ml-1.5 text-xs font-normal ${vehicle.satellites >= 6 ? 'text-emerald-400' : vehicle.satellites >= 4 ? 'text-amber-400' : 'text-red-400'}`}>
                  {vehicle.satellites >= 6 ? 'Good' : vehicle.satellites >= 4 ? 'Fair' : 'Weak'}
                </span>
              </>
            ) : '—'}
          </p>
        </div>

        <div className="bg-slate-900 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Clock3 size={12} className="text-slate-500" />
            <span className="text-xs text-slate-500">Last seen</span>
          </div>
          <p className="text-sm font-semibold text-white">{vehicle.lastSeenLabel}</p>
        </div>

        <div className="bg-slate-900 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Battery size={12} className="text-slate-500" />
            <span className="text-xs text-slate-500">Battery</span>
          </div>
          {battPct != null ? (
            <>
              <p className="text-sm font-semibold text-white">{battPct}%</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all ${battPct > 50 ? 'bg-emerald-400' : battPct > 20 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${battPct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">—</p>
          )}
        </div>

        <div className="bg-slate-900 px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Route size={12} className="text-slate-500" />
            <span className="text-xs text-slate-500">Distance</span>
          </div>
          <p className="text-sm font-semibold text-white">
            {distKm.toFixed(2)}<span className="ml-1 text-xs font-normal text-slate-400">km</span>
          </p>
          <p className="text-xs text-slate-600">this session</p>
        </div>
      </div>

      {/* Coordinates */}
      <div className="flex items-center gap-2 border-t border-slate-800 px-4 py-2.5">
        <MapPin size={12} className="flex-shrink-0 text-slate-500" />
        <p className="font-mono text-xs text-slate-400">
          {vehicle.lat.toFixed(6)}, {vehicle.lon.toFixed(6)}
        </p>
      </div>
    </div>
  );
}

// ─── Page: Live Tracking ──────────────────────────────────────────────────────

function LiveTrackingPage({ fleet, loading, error }: { fleet: FleetPosition[]; loading: boolean; error: string | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const liveVehicles = useLiveVehicles();

  const sel = fleet.find(v => v.imei === selected) ?? null;
  const liveVehicle = liveVehicles.find(v => v.id === selected);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Live Tracking</h2>
        <p className="mt-1 text-sm text-slate-400">Real-time vehicle positions — click a car on the map or the list to inspect</p>
      </div>
      {error && <SectionError message={error} />}
      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-3">
          <div className="h-[440px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <LiveMap selectedId={selected ?? undefined} onVehicleClick={setSelected} />
          </div>
          {sel
            ? <VehicleDetailCard vehicle={sel} live={liveVehicle} />
            : (
              <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-500">
                <MapPin size={15} />
                Select a vehicle from the map or the list to see details.
              </div>
            )
          }
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-4 text-lg font-semibold text-white">Fleet</h3>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="space-y-2">
              {fleet.map(v => (
                <button
                  key={v.imei}
                  type="button"
                  onClick={() => setSelected(v.imei)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected === v.imei
                      ? 'border-cyan-500/40 bg-cyan-500/10'
                      : 'border-slate-800 hover:bg-slate-800/50'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    v.status === 'moving' ? 'bg-cyan-400' : v.status === 'parked' ? 'bg-amber-400' : 'bg-red-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium text-white">{v.imei}</p>
                    <p className="text-xs text-slate-400">{v.speed_kph.toFixed(0)} km/h · {v.lastSeenLabel}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize ${statusStyles[v.status]}`}>
                    {v.status}
                  </span>
                </button>
              ))}
              {fleet.length === 0 && <p className="text-sm text-slate-400">No devices found.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page: Playback ───────────────────────────────────────────────────────────

function PlaybackPage({ fleet }: { fleet: FleetPosition[] }) {
  const [imei, setImei] = useState(fleet[0]?.imei ?? '');
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() - 2);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [points, setPoints] = useState<LatestPosition[]>([]);
  const [loadingPb, setLoadingPb] = useState(false);
  const [errorPb, setErrorPb] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const load = async () => {
    if (!imei) return;
    setLoadingPb(true); setErrorPb(null);
    try {
      const data = await getPlayback(imei, new Date(from).toISOString(), new Date(to).toISOString());
      setPoints(data); setIdx(0); setPlaying(false);
    } catch (e) {
      setErrorPb(e instanceof Error ? e.message : 'Failed to load playback.');
    } finally { setLoadingPb(false); }
  };

  useEffect(() => {
    if (!playing || points.length === 0) return;
    if (idx >= points.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setIdx(i => i + 1), 500);
    return () => clearTimeout(t);
  }, [playing, idx, points.length]);

  const pct = points.length > 1 ? Math.round((idx / (points.length - 1)) * 100) : 0;
  const cur = points[idx];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Playback</h2>
        <p className="mt-1 text-sm text-slate-400">Replay historical GPS routes</p>
      </div>
      {errorPb && <SectionError message={errorPb} />}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">IMEI</label>
            <select
              value={imei}
              onChange={e => setImei(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
            >
              {fleet.map(v => <option key={v.imei} value={v.imei}>{v.imei}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">From</label>
            <input
              type="datetime-local"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">To</label>
            <input
              type="datetime-local"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loadingPb}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          <PlayCircle size={16} />{loadingPb ? 'Loading…' : 'Load Route'}
        </button>

        {points.length > 0 && (
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{points.length} points loaded</span>
              <span>Point {idx + 1} / {points.length}</span>
            </div>
            <div className="relative h-2 cursor-pointer rounded-full bg-slate-700"
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect();
                const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                setIdx(Math.round(p * (points.length - 1)));
              }}
            >
              <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-cyan-400 border-2 border-slate-950 transition-all" style={{ left: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setIdx(i => Math.max(0, i - 1))}
                className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
                ⏮
              </button>
              <button type="button" onClick={() => setPlaying(p => !p)}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button type="button" onClick={() => setIdx(i => Math.min(points.length - 1, i + 1))}
                className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
                ⏭
              </button>
              {cur && (
                <span className="ml-auto font-mono text-xs text-slate-400">
                  {cur.lat.toFixed(5)}, {cur.lon.toFixed(5)} · {cur.speed_kph.toFixed(0)} km/h
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      <MapPlaceholder label="Playback map" sub="Insert your PlaybackMap component here." />
    </div>
  );
}

// ─── Page: Reports ────────────────────────────────────────────────────────────

function ReportsPage({ fleet }: { fleet: FleetPosition[] }) {
  const topSpeeds = [...fleet].sort((a, b) => b.speed_kph - a.speed_kph).slice(0, 5);
  const maxSpeed = Math.max(...topSpeeds.map(v => v.speed_kph), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Reports</h2>
          <p className="mt-1 text-sm text-slate-400">Fleet analytics</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
          <FileText size={15} /> Export CSV
        </button>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-4 text-base font-semibold text-white">Top speeds</h3>
          <div className="space-y-3">
            {topSpeeds.map(v => (
              <div key={v.imei} className="flex items-center gap-3">
                <span className="w-28 truncate font-mono text-xs text-slate-400">{v.imei.slice(-8)}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${(v.speed_kph / maxSpeed) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs text-slate-300">{v.speed_kph.toFixed(0)} km/h</span>
              </div>
            ))}
            {topSpeeds.length === 0 && <p className="text-sm text-slate-400">No data.</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-4 text-base font-semibold text-white">Status breakdown</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Moving', value: fleet.filter(v => v.status === 'moving').length, fill: '#06b6d4' },
                    { name: 'Parked', value: fleet.filter(v => v.status === 'parked').length, fill: '#f59e0b' },
                    { name: 'Offline', value: fleet.filter(v => v.status === 'offline').length, fill: '#ef4444' },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={76}
                  paddingAngle={4}
                >
                  {['#06b6d4','#f59e0b','#ef4444'].map(fill => <Cell key={fill} fill={fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page: Settings ───────────────────────────────────────────────────────────

function SettingsPage() {
  const [apiUrl, setApiUrl] = useState(API_URL);
  const [offlineMin, setOfflineMin] = useState(5);
  const [speedThreshold, setSpeedThreshold] = useState(MOVING_SPEED_KPH);
  const [refreshSec, setRefreshSec] = useState(REFRESH_EVERY_MS / 1000);
  const [saved, setSaved] = useState(false);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Settings</h2>
        <p className="mt-1 text-sm text-slate-400">System configuration</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h3 className="text-base font-semibold text-white">API connection</h3>
          <div>
            <label className="mb-1 block text-xs text-slate-400">API base URL</label>
            <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Refresh interval (seconds)</label>
            <input type="number" value={refreshSec} onChange={e => setRefreshSec(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h3 className="text-base font-semibold text-white">Detection thresholds</h3>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Offline after (minutes without data)</label>
            <input type="number" value={offlineMin} onChange={e => setOfflineMin(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Moving speed threshold (km/h)</label>
            <input type="number" value={speedThreshold} onChange={e => setSpeedThreshold(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none" />
          </div>
        </div>
      </div>
      <button type="button" onClick={save}
        className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950">
        {saved ? '✓ Saved!' : 'Save changes'}
      </button>
    </div>
  );
}

// ─── Sidebar nav config ───────────────────────────────────────────────────────

const NAV_ITEMS: { label: string; page: Page; icon: LucideIcon }[] = [
  { label: 'Dashboard', page: 'dashboard', icon: BarChart3 },
  { label: 'Live Tracking', page: 'tracking', icon: LocateFixed },
  { label: 'Playback', page: 'playback', icon: PlayCircle },
  { label: 'Devices', page: 'devices', icon: Router },
  { label: 'Users', page: 'users', icon: Users },
  { label: 'Reports', page: 'reports', icon: FileText },
  { label: 'Settings', page: 'settings', icon: Settings },
];

// ─── Root component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [positions, setPositions] = useState<LatestPosition[]>([]);
  const [selectedImei, setSelectedImei] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    window.location.href = '/login';
  };

  const loadFleet = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    try {
      const data = await getLatestPositions();
      setPositions(data);
      if (!selectedImei && data.length > 0) setSelectedImei(data[0].imei);
      setLastSync(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tracker positions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedImei]);

  useEffect(() => {
    void loadFleet();
    const id = window.setInterval(() => void loadFleet(true), REFRESH_EVERY_MS);
    return () => window.clearInterval(id);
  }, [loadFleet]);

  const fleet: FleetPosition[] = useMemo(() =>
    positions.map(p => ({ ...p, status: getStatus(p), lastSeenLabel: formatLastSeen(p.time) })),
    [positions],
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 240 : 72 }}
        className="flex flex-col border-r border-slate-800 bg-slate-900 overflow-hidden"
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4 flex-shrink-0">
          {sidebarOpen && (
            <span className="text-lg font-bold text-cyan-400 whitespace-nowrap">YUVO GPS</span>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen(o => !o)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white flex-shrink-0"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ label, page, icon: Icon }) => (
            <button
              key={page}
              type="button"
              onClick={() => setActivePage(page)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${
                activePage === page
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span className="whitespace-nowrap">{label}</span>}
            </button>
          ))}
        </nav>

        {/* Status */}
        {sidebarOpen && (
          <div className="border-t border-slate-800 p-4 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                TCP :5000
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                API :3000
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        )}
      </motion.aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto p-6">
        {activePage === 'dashboard' && (
          <DashboardPage
            fleet={fleet}
            loading={loading}
            error={error}
            query={query}
            setQuery={setQuery}
            selectedImei={selectedImei}
            setSelectedImei={setSelectedImei}
            lastSync={lastSync}
            refreshing={refreshing}
            onRefresh={() => void loadFleet(true)}
          />
        )}
        {activePage === 'tracking' && (
          <LiveTrackingPage fleet={fleet} loading={loading} error={error} />
        )}
        {activePage === 'playback' && (
          <PlaybackPage fleet={fleet} />
        )}
        {activePage === 'devices' && (
          <DevicesPage />
        )}
        {activePage === 'users' && (
          <UsersPage />
        )}
        {activePage === 'reports' && (
          <ReportsPage fleet={fleet} />
        )}
        {activePage === 'settings' && (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}
