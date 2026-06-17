import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDevices } from './DevicesPage';
import { loadManagedUsers, saveManagedUsers } from './UsersPage';
import { useLiveVehicles } from '../shared/hooks/useLiveVehicles';
import type { LiveVehicle } from '../store/liveVehicles';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  Battery,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  LocateFixed,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  PlayCircle,
  Radio,
  RefreshCw,
  Route,
  Search,
  Settings,
  Truck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import LiveMap from '../features/map/LiveMap';
import PlaybackMap from './PlaybackPage';

/**
 * YUVO GPS — User Dashboard
 * File: src/pages/UserDashboard.tsx
 *
 * Pages: Overview | Live Tracking | Playback | Reports | Profile
 *
 * API endpoints:
 *   GET /api/latest
 *   GET /api/playback?imei=<imei>&from=<ISO>&to=<ISO>
 *
 * Later for real user restriction:
 *   GET /api/users/me/vehicles
 *   GET /api/users/me/latest
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const OFFLINE_AFTER_MS = 5 * 60 * 1000;
const REFRESH_EVERY_MS = 10_000;
const MOVING_SPEED_KPH = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = 'overview' | 'tracking' | 'playback' | 'reports' | 'profile';
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

type StoredUser = {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
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

function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

async function getLatestPositions(signal?: AbortSignal): Promise<LatestPosition[]> {
  const token = localStorage.getItem('token');

  const res = await fetch(`${API_URL}/api/latest`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

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
  const token = localStorage.getItem('token');
  const params = new URLSearchParams({ imei, from, to });

  const res = await fetch(`${API_URL}/api/playback?${params}`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

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

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
      <AlertTriangle size={18} />
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ─── Page: Overview ───────────────────────────────────────────────────────────

function OverviewPage({
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
  const offline = fleet.filter(v => v.status === 'offline').length;
  const online = fleet.length - offline;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">User Dashboard</h2>
          <p className="mt-1 text-sm text-slate-400">Your assigned vehicle tracking panel</p>
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
        <StatCard title="My Vehicles" value={fleet.length} icon={Truck} accent="bg-indigo-500/15 text-indigo-300" />
        <StatCard title="Online" value={online} icon={Wifi} accent="bg-emerald-500/15 text-emerald-300" />
        <StatCard title="Moving" value={moving} icon={Navigation} accent="bg-cyan-500/15 text-cyan-300" />
        <StatCard title="Offline" value={offline} icon={WifiOff} accent="bg-red-500/15 text-red-300" />
      </div>

      {/* Map */}
      <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <LiveMap />
      </div>

      {/* Vehicle table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 p-5">
          <div>
            <h3 className="text-lg font-semibold text-white">My Latest Positions</h3>
            <p className="text-sm text-slate-400">Vehicles assigned to this account</p>
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
          <p className="p-10 text-center text-slate-400">Loading vehicles…</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-slate-400">No assigned vehicles found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-5 py-4">IMEI</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Speed</th>
                  <th className="px-5 py-4">Coordinates</th>
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
        <div className="flex flex-shrink-0 items-center gap-1.5">
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
                <span className={`ml-1.5 text-xs font-normal ${
                  vehicle.satellites >= 6 ? 'text-emerald-400' :
                  vehicle.satellites >= 4 ? 'text-amber-400' : 'text-red-400'
                }`}>
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
        <p className="mt-1 text-sm text-slate-400">Track your vehicle in real time — click a car on the map or the list</p>
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
          <h3 className="mb-4 text-lg font-semibold text-white">My Vehicles</h3>

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
              {fleet.length === 0 && <p className="text-sm text-slate-400">No vehicles assigned.</p>}
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
        <p className="mt-1 text-sm text-slate-400">Replay your vehicle history</p>
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
          disabled={loadingPb || !imei}
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

      <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
  <PlaybackMap points={points} currentIndex={idx} />
</div>
    </div>
  );
}

// ─── Historical report helpers ─────────────────────────────────────────────────

interface VehicleReport {
  imei: string;
  name?: string;
  pointCount: number;
  distanceKm: number;
  maxSpeedKph: number;
  movingMinutes: number;
  idleMinutes: number;
  noDataMinutes: number;
  failed?: boolean;
}

// Gaps longer than this are treated as the tracker having no signal (engine
// off with no backup power, dead zone, SIM issue) rather than the vehicle
// sitting idle the whole time — otherwise a car parked for 3 days with the
// tracker unplugged would misleadingly show as "72 hours idle".
const REPORT_GAP_MINUTES = 30;

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function summarizeRoute(imei: string, points: LatestPosition[], name?: string): VehicleReport {
  if (points.length === 0) {
    return { imei, name, pointCount: 0, distanceKm: 0, maxSpeedKph: 0, movingMinutes: 0, idleMinutes: 0, noDataMinutes: 0 };
  }

  let distanceKm = 0;
  let maxSpeedKph = points[0].speed_kph;
  let movingMinutes = 0;
  let idleMinutes = 0;
  let noDataMinutes = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const cur = points[i];
    const next = points[i + 1];
    maxSpeedKph = Math.max(maxSpeedKph, next.speed_kph);
    distanceKm += haversineKm(cur, next);

    const dtMinutes = (new Date(next.time).getTime() - new Date(cur.time).getTime()) / 60_000;
    if (!Number.isFinite(dtMinutes) || dtMinutes <= 0) continue;

    if (dtMinutes > REPORT_GAP_MINUTES) {
      noDataMinutes += dtMinutes;
    } else if (cur.speed_kph > MOVING_SPEED_KPH) {
      movingMinutes += dtMinutes;
    } else {
      idleMinutes += dtMinutes;
    }
  }

  return { imei, name, pointCount: points.length, distanceKm, maxSpeedKph, movingMinutes, idleMinutes, noDataMinutes };
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function downloadReportCsv(reports: VehicleReport[], from: string, to: string) {
  const header = 'IMEI,Name,Distance (km),Max speed (km/h),Moving (hrs),Idle (hrs),No data (hrs),GPS points\n';
  const rows = reports.map(r => [
    r.imei,
    `"${(r.name ?? '').replace(/"/g, '""')}"`,
    r.distanceKm.toFixed(1),
    r.maxSpeedKph.toFixed(0),
    formatHours(r.movingMinutes),
    formatHours(r.idleMinutes),
    formatHours(r.noDataMinutes),
    r.pointCount,
  ].join(','));
  const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yuvo-fleet-report_${from}_to_${to}.csv`.replace(/[: ]/g, '-');
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page: Reports ────────────────────────────────────────────────────────────

function ReportsPage({ fleet }: { fleet: FleetPosition[] }) {
  const liveVehicles = useLiveVehicles();
  const nameByImei = useMemo(() => new Map(liveVehicles.map(v => [v.id, v.name])), [liveVehicles]);

  const [selectedImei, setSelectedImei] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [reports, setReports] = useState<VehicleReport[] | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const runReport = async () => {
    const targets = selectedImei ? fleet.filter(v => v.imei === selectedImei) : fleet;
    if (targets.length === 0) return;
    setLoadingReport(true);
    setReportError(null);
    try {
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(to).toISOString();
      const results = await Promise.all(
        targets.map(async (v): Promise<VehicleReport> => {
          const name = nameByImei.get(v.imei);
          try {
            const points = await getPlayback(v.imei, fromIso, toIso);
            return summarizeRoute(v.imei, points, name);
          } catch {
            return {
              imei: v.imei, name, pointCount: 0, distanceKm: 0, maxSpeedKph: 0,
              movingMinutes: 0, idleMinutes: 0, noDataMinutes: 0, failed: true,
            };
          }
        }),
      );
      setReports(results);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'Failed to generate report.');
    } finally {
      setLoadingReport(false);
    }
  };

  const totals = useMemo(() => {
    if (!reports || reports.length === 0) return null;
    return reports.reduce(
      (acc, r) => ({
        distanceKm: acc.distanceKm + r.distanceKm,
        movingMinutes: acc.movingMinutes + r.movingMinutes,
        idleMinutes: acc.idleMinutes + r.idleMinutes,
        maxSpeedKph: Math.max(acc.maxSpeedKph, r.maxSpeedKph),
      }),
      { distanceKm: 0, movingMinutes: 0, idleMinutes: 0, maxSpeedKph: 0 },
    );
  }, [reports]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Reports</h2>
          <p className="mt-1 text-sm text-slate-400">Historical distance, speed, and idle time for your vehicles</p>
        </div>
        <button
          type="button"
          onClick={() => reports && downloadReportCsv(reports, from, to)}
          disabled={!reports}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          <FileText size={15} /> Export CSV
        </button>
      </div>

      {reportError && <SectionError message={reportError} />}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Vehicle</label>
            <select
              value={selectedImei}
              onChange={e => setSelectedImei(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">All vehicles</option>
              {fleet.map(v => (
                <option key={v.imei} value={v.imei}>
                  {nameByImei.get(v.imei) ? `${nameByImei.get(v.imei)} — ${v.imei}` : v.imei}
                </option>
              ))}
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
          onClick={() => void runReport()}
          disabled={loadingReport || fleet.length === 0}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          <PlayCircle size={16} />{loadingReport ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {totals && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Distance (km)" value={Math.round(totals.distanceKm)} icon={Route} accent="bg-cyan-500/15 text-cyan-300" />
          <StatCard title="Fastest Recorded (km/h)" value={Math.round(totals.maxSpeedKph)} icon={Gauge} accent="bg-indigo-500/15 text-indigo-300" />
          <StatCard title="Total Moving (hrs)" value={Math.round(totals.movingMinutes / 60)} icon={Navigation} accent="bg-emerald-500/15 text-emerald-300" />
          <StatCard title="Total Idle (hrs)" value={Math.round(totals.idleMinutes / 60)} icon={Clock3} accent="bg-amber-500/15 text-amber-300" />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-5">
          <h3 className="text-base font-semibold text-white">Per-vehicle summary</h3>
          <p className="text-sm text-slate-400">
            {reports ? `${from.replace('T', ' ')} → ${to.replace('T', ' ')}` : 'Choose a vehicle and date range, then generate a report.'}
          </p>
        </div>
        {!reports ? (
          <p className="p-10 text-center text-slate-400">
            {loadingReport ? 'Generating report…' : 'No report generated yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-5 py-4">Vehicle</th>
                  <th className="px-5 py-4">Distance</th>
                  <th className="px-5 py-4">Max speed</th>
                  <th className="px-5 py-4">Moving</th>
                  <th className="px-5 py-4">Idle</th>
                  <th className="px-5 py-4">No data</th>
                  <th className="px-5 py-4">Points</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.imei} className="border-t border-slate-800">
                    <td className="px-5 py-4 font-medium text-white">
                      {r.name || r.imei}
                      {r.name && <div className="font-mono text-xs text-slate-500">{r.imei}</div>}
                    </td>
                    {r.failed ? (
                      <td className="px-5 py-4 text-red-300" colSpan={6}>Failed to load this vehicle&apos;s history.</td>
                    ) : (
                      <>
                        <td className="px-5 py-4 text-slate-300">{r.distanceKm.toFixed(1)} km</td>
                        <td className="px-5 py-4 text-slate-300">{r.maxSpeedKph.toFixed(0)} km/h</td>
                        <td className="px-5 py-4 text-slate-300">{formatHours(r.movingMinutes)} hrs</td>
                        <td className="px-5 py-4 text-slate-300">{formatHours(r.idleMinutes)} hrs</td>
                        <td className="px-5 py-4 text-slate-500">{formatHours(r.noDataMinutes)} hrs</td>
                        <td className="px-5 py-4 text-slate-500">{r.pointCount}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="mb-4 text-base font-semibold text-white">Vehicle summary</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-800 pb-3">
            <span className="text-slate-400">Total vehicles</span>
            <span className="font-medium text-white">{fleet.length}</span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-3">
            <span className="text-slate-400">Moving</span>
            <span className="font-medium text-cyan-300">{fleet.filter(v => v.status === 'moving').length}</span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-3">
            <span className="text-slate-400">Parked</span>
            <span className="font-medium text-amber-300">{fleet.filter(v => v.status === 'parked').length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Offline</span>
            <span className="font-medium text-red-300">{fleet.filter(v => v.status === 'offline').length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page: Profile ────────────────────────────────────────────────────────────

function ProfilePage({ user }: { user: StoredUser | null }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fieldCls = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 transition-colors';

  const handleChangePassword = () => {
    setPwdMsg(null);
    if (newPwd.length < 6) {
      setPwdMsg({ text: 'New password must be at least 6 characters.', ok: false });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ text: 'Passwords do not match.', ok: false });
      return;
    }
    const all = loadManagedUsers();
    const idx = all.findIndex(u => u.email === user?.email);
    if (idx === -1 || all[idx].password !== currentPwd) {
      setPwdMsg({ text: 'Current password is incorrect.', ok: false });
      return;
    }
    all[idx] = { ...all[idx], password: newPwd };
    saveManagedUsers(all);
    setPwdMsg({ text: 'Password updated successfully.', ok: true });
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
  };

  const isManaged = loadManagedUsers().some(u => u.email === user?.email);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Profile</h2>
        <p className="mt-1 text-sm text-slate-400">Your account information</p>
      </div>

      {/* Account info */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Name</label>
          <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
            {user?.name ?? 'Unknown user'}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Email</label>
          <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
            {user?.email ?? 'No email saved'}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Role</label>
          <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white capitalize">
            {user?.role ?? 'user'}
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white">Change password</h3>
          <p className="mt-0.5 text-xs text-slate-500">Update the password you use to sign in.</p>
        </div>

        {!isManaged ? (
          <p className="text-sm text-slate-500">Password changes for built-in accounts must be made by an administrator.</p>
        ) : (
          <>
            {pwdMsg && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                pwdMsg.ok
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/25 bg-red-500/10 text-red-300'
              }`}>
                {pwdMsg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {pwdMsg.text}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs text-slate-400">Current password</label>
              <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
                placeholder="Enter current password" className={fieldCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-slate-400">New password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className={`${fieldCls} pr-10`}
                />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-slate-400">Confirm new password</label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Re-enter new password" className={fieldCls} />
            </div>
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={!currentPwd || !newPwd || !confirmPwd}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 transition-opacity"
            >
              Update password
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar nav config ───────────────────────────────────────────────────────

const NAV_ITEMS: { label: string; page: Page; icon: LucideIcon }[] = [
  { label: 'Overview', page: 'overview', icon: BarChart3 },
  { label: 'Live Tracking', page: 'tracking', icon: LocateFixed },
  { label: 'Playback', page: 'playback', icon: PlayCircle },
  { label: 'Reports', page: 'reports', icon: FileText },
  { label: 'Profile', page: 'profile', icon: Settings },
];

// ─── Root component ───────────────────────────────────────────────────────────

export default function UserDashboard() {
  const [activePage, setActivePage] = useState<Page>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [positions, setPositions] = useState<LatestPosition[]>([]);
  const [selectedImei, setSelectedImei] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const user = getStoredUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    window.location.href = '/login';
  };

  const loadFleet = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    try {
      const userEmail = user?.email ?? '';
      const [allPositions, allDevices] = await Promise.all([
        getLatestPositions(),
        fetchDevices(),
      ]);
      const assignedImeis = new Set(
        allDevices
          .filter(d => d.assignedTo && d.assignedTo.toLowerCase() === userEmail.toLowerCase())
          .map(d => d.imei),
      );
      const data = assignedImeis.size > 0
        ? allPositions.filter(p => assignedImeis.has(p.imei))
        : allPositions;
      setPositions(data);
      if (!selectedImei && data.length > 0) setSelectedImei(data[0].imei);
      setLastSync(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assigned vehicles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedImei, user?.email]);

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

        {/* Account + Logout */}
        {sidebarOpen && (
          <div className="border-t border-slate-800 p-4 space-y-3">
            <div className="space-y-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.name ?? 'User'}
              </p>
              <p className="text-xs text-slate-500">
                User account
              </p>
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
        {activePage === 'overview' && (
          <OverviewPage
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
        {activePage === 'reports' && (
          <ReportsPage fleet={fleet} />
        )}
        {activePage === 'profile' && (
          <ProfilePage user={user} />
        )}
      </main>
    </div>
  );
}