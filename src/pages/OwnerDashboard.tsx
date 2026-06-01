import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Gauge,
  LogOut,
  Menu,
  Navigation,
  RefreshCw,
  Search,
  Settings,
  Truck,
  UserPlus,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import LiveMap from '../features/map/LiveMap';
import UsersPage from './UsersPage';
import { loadManagedUsers, saveManagedUsers } from './UsersPage';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const OFFLINE_AFTER_MS = 5 * 60 * 1000;
const REFRESH_EVERY_MS = 10_000;
const MOVING_SPEED_KPH = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = 'fleet' | 'users' | 'profile';
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
  const raw = localStorage.getItem('user') ?? sessionStorage.getItem('user');
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredUser; } catch { return null; }
}

async function getLatestPositions(signal?: AbortSignal): Promise<LatestPosition[]> {
  const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
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

// ─── Shared sub-components ────────────────────────────────────────────────────

function StatCard({ title, value, icon: Icon, accent }: { title: string; value: number; icon: LucideIcon; accent: string }) {
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

// ─── Page: Fleet ──────────────────────────────────────────────────────────────

function FleetPage({
  fleet, loading, error, query, setQuery, selectedImei, setSelectedImei,
  lastSync, refreshing, onRefresh,
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">My Fleet</h2>
          <p className="mt-1 text-sm text-slate-400">Live view of your vehicles</p>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Vehicles" value={fleet.length} icon={Truck} accent="bg-indigo-500/15 text-indigo-300" />
        <StatCard title="Online" value={online} icon={Wifi} accent="bg-emerald-500/15 text-emerald-300" />
        <StatCard title="Moving" value={moving} icon={Navigation} accent="bg-cyan-500/15 text-cyan-300" />
        <StatCard title="Offline" value={offline} icon={WifiOff} accent="bg-red-500/15 text-red-300" />
      </div>

      <div className="h-[380px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <LiveMap />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 p-5">
          <h3 className="text-lg font-semibold text-white">Latest Positions</h3>
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
          <p className="p-10 text-center text-slate-400">Loading fleet…</p>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-slate-400">No vehicles found.</p>
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

// ─── Page: Profile ────────────────────────────────────────────────────────────

function ProfilePage({ user }: { user: StoredUser | null }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fieldCls =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 transition-colors';

  const isManaged = loadManagedUsers().some(u => u.email === user?.email);

  const handleChangePassword = () => {
    setPwdMsg(null);
    if (newPwd.length < 6) { setPwdMsg({ text: 'New password must be at least 6 characters.', ok: false }); return; }
    if (newPwd !== confirmPwd) { setPwdMsg({ text: 'Passwords do not match.', ok: false }); return; }
    const all = loadManagedUsers();
    const idx = all.findIndex(u => u.email === user?.email);
    if (idx === -1 || all[idx].password !== currentPwd) { setPwdMsg({ text: 'Current password is incorrect.', ok: false }); return; }
    all[idx] = { ...all[idx], password: newPwd };
    saveManagedUsers(all);
    setPwdMsg({ text: 'Password updated successfully.', ok: true });
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Profile</h2>
        <p className="mt-1 text-sm text-slate-400">Your account information</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Name</label>
          <div className={fieldCls}>{user?.name ?? 'Unknown'}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Email</label>
          <div className={fieldCls}>{user?.email ?? '—'}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Role</label>
          <div className={`${fieldCls} capitalize`}>{user?.role?.toLowerCase() ?? 'owner'}</div>
        </div>
      </div>

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
                <input type={showNew ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  placeholder="Minimum 6 characters" className={`${fieldCls} pr-10`} />
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
            <button type="button" onClick={handleChangePassword}
              disabled={!currentPwd || !newPwd || !confirmPwd}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 transition-opacity">
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
  { label: 'My Fleet',  page: 'fleet',   icon: BarChart3  },
  { label: 'Users',     page: 'users',   icon: UserPlus   },
  { label: 'Profile',   page: 'profile', icon: Settings   },
];

// ─── Root component ───────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const [activePage, setActivePage] = useState<Page>('fleet');
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
    ['token', 'user', 'role'].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    window.location.href = '/';
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
      setError(err instanceof Error ? err.message : 'Unable to load fleet.');
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
        animate={{ width: sidebarOpen ? 220 : 68 }}
        className="flex flex-col border-r border-slate-800 bg-slate-900 overflow-hidden flex-shrink-0"
      >
        {/* Logo / toggle */}
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

        {sidebarOpen && (
          <div className="border-b border-slate-800 px-4 py-3">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
              Fleet Owner
            </span>
          </div>
        )}

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
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-300">
                {user?.name?.charAt(0).toUpperCase() ?? 'O'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{user?.name ?? 'Owner'}</p>
                <p className="truncate text-xs text-slate-500">{user?.email ?? ''}</p>
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
        {activePage === 'fleet' && (
          <FleetPage
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
        {activePage === 'users' && <UsersPage />}
        {activePage === 'profile' && <ProfilePage user={user} />}
      </main>
    </div>
  );
}
