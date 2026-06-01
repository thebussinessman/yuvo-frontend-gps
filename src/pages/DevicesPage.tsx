import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

/**
 * YUVO GPS — Standalone Devices Page
 * File: src/pages/DevicesPage.tsx
 *
 * NestJS API endpoints consumed:
 *   GET    /api/devices              → DeviceRecord[]
 *   POST   /api/devices              → DeviceRecord       body: NewDevicePayload
 *   PUT    /api/devices/:imei        → DeviceRecord       body: EditDevicePayload
 *   DELETE /api/devices/:imei        → { success: boolean }
 *   GET    /api/latest               → LatestPosition[]   (live GPS status overlay)
 *
 * Vite .env:
 *   VITE_API_URL=http://localhost:3000
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const OFFLINE_AFTER_MS = 5 * 60 * 1000;
const MOVING_SPEED_KPH = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeviceRecord = {
  imei: string;
  label: string;
  simCard: string;
  vehicleType: string;
  notes: string;
  assignedTo?: string;   // user email this device belongs to
  createdAt?: string;
};

type NewDevicePayload = Omit<DeviceRecord, 'createdAt'>;
type EditDevicePayload = Omit<DeviceRecord, 'imei' | 'createdAt'>;

type LatestPosition = {
  imei: string;
  time: string;
  lat: number;
  lon: number;
  speed_kph: number;
  course: number;
  satellites: number;
};

type DeviceStatus = 'moving' | 'parked' | 'offline' | 'unknown';

type SortField = 'label' | 'imei' | 'vehicleType' | 'status' | 'createdAt';
type SortDir = 'asc' | 'desc';

// ─── API layer ────────────────────────────────────────────────────────────────

export async function fetchDevices(signal?: AbortSignal): Promise<DeviceRecord[]> {
  const res = await fetch(`${API_URL}/api/devices`, { signal });
  if (!res.ok) throw new Error(`GET /api/devices failed: ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid response from /api/devices');
  return data as DeviceRecord[];
}

async function fetchLatestPositions(signal?: AbortSignal): Promise<LatestPosition[]> {
  const res = await fetch(`${API_URL}/api/latest`, { signal });
  if (!res.ok) throw new Error(`GET /api/latest failed: ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid response from /api/latest');
  return data as LatestPosition[];
}

async function createDevice(payload: NewDevicePayload): Promise<DeviceRecord> {
  const res = await fetch(`${API_URL}/api/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to create device: ${body || res.status}`);
  }
  return res.json() as Promise<DeviceRecord>;
}

async function updateDevice(imei: string, payload: EditDevicePayload): Promise<DeviceRecord> {
  const res = await fetch(`${API_URL}/api/devices/${encodeURIComponent(imei)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to update device: ${body || res.status}`);
  }
  return res.json() as Promise<DeviceRecord>;
}

async function deleteDevice(imei: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/devices/${encodeURIComponent(imei)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to delete device: ${body || res.status}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatus(pos: LatestPosition | undefined): DeviceStatus {
  if (!pos) return 'unknown';
  const age = Date.now() - new Date(pos.time).getTime();
  if (!Number.isFinite(age) || age > OFFLINE_AFTER_MS) return 'offline';
  return pos.speed_kph > MOVING_SPEED_KPH ? 'moving' : 'parked';
}

function formatLastSeen(time: string | undefined): string {
  if (!time) return '—';
  const ms = Date.now() - new Date(time).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Unknown';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_META: Record<DeviceStatus, { label: string; dot: string; badge: string }> = {
  moving:  { label: 'Moving',  dot: 'bg-cyan-400',   badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' },
  parked:  { label: 'Parked',  dot: 'bg-amber-400',  badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  offline: { label: 'Offline', dot: 'bg-red-400',    badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  unknown: { label: 'Unknown', dot: 'bg-slate-500',  badge: 'bg-slate-700/40 text-slate-400 border-slate-600/20' },
};

const VEHICLE_TYPES = ['Truck', 'Van', 'Car', 'Motorcycle', 'Bus', 'Trailer', 'Other'];

// ─── Shared UI pieces ─────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl ${
      type === 'success'
        ? 'border-emerald-500/30 bg-slate-900 text-emerald-300'
        : 'border-red-500/30 bg-slate-900 text-red-300'
    }`}>
      {type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-slate-400" />;
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors placeholder:text-slate-600';

const labelCls = 'mb-1.5 block text-xs font-medium text-slate-400';

// ─── Device form (shared by Add & Edit) ──────────────────────────────────────

type DeviceFormProps = {
  mode: 'add' | 'edit';
  initial: DeviceRecord;
  onSubmit: (d: DeviceRecord) => Promise<void>;
  onClose: () => void;
};

const EMPTY: DeviceRecord = { imei: '', label: '', simCard: '', vehicleType: '', notes: '', assignedTo: '' };

function DeviceFormModal({ mode, initial, onSubmit, onClose }: DeviceFormProps) {
  const [form, setForm] = useState<DeviceRecord>(initial);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof DeviceRecord) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const valid = form.imei.trim().length >= 10;

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit(form);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'An error occurred.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/75 px-4 py-12"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              {mode === 'add' ? 'Add new device' : 'Edit device'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {mode === 'add' ? 'Register a new GPS tracker to your fleet' : `Editing ${initial.imei}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form body */}
        <div className="space-y-4 px-6 py-5">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertTriangle size={14} />
              {formError}
            </div>
          )}

          {/* IMEI */}
          <div>
            <label className={labelCls}>
              IMEI <span className="text-red-400">*</span>
            </label>
            <input
              value={form.imei}
              onChange={set('imei')}
              placeholder="e.g. 862549051234567 (15 digits)"
              maxLength={17}
              disabled={mode === 'edit'}
              className={`${inputCls} ${mode === 'edit' ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            {mode === 'add' && form.imei && form.imei.length < 10 && (
              <p className="mt-1 text-xs text-red-400">IMEI must be at least 10 characters</p>
            )}
          </div>

          {/* Label + Vehicle type side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Device label</label>
              <input
                value={form.label}
                onChange={set('label')}
                placeholder="e.g. Truck 04"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Vehicle type</label>
              <select value={form.vehicleType} onChange={set('vehicleType')}
                className={inputCls}>
                <option value="">Select type…</option>
                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* SIM card */}
          <div>
            <label className={labelCls}>SIM / phone number</label>
            <input
              value={form.simCard}
              onChange={set('simCard')}
              placeholder="e.g. +260 97 1234567"
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Driver name, route, assigned branch…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Assign to user */}
          <div>
            <label className={labelCls}>Assign to user <span className="text-slate-600">(email)</span></label>
            <input
              type="email"
              value={form.assignedTo ?? ''}
              onChange={set('assignedTo')}
              placeholder="e.g. user@yuvoafrica.com"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-600">Leave blank to keep unassigned (admin-only visibility).</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={handleSubmit}
            className="flex min-w-[120px] items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 transition-opacity"
          >
            {saving ? <><Spinner size={14} /> Saving…</> : mode === 'add' ? 'Add device' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({
  device,
  onConfirm,
  onClose,
}: {
  device: DeviceRecord;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onConfirm();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-red-500/25 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Delete device?</h3>
            <p className="text-xs text-slate-500">This cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-slate-400">
          You are about to permanently remove{' '}
          <span className="font-semibold text-white">{device.label || device.imei}</span>{' '}
          {device.label && <span className="font-mono text-xs text-slate-500">({device.imei})</span>} from the fleet.
          Historical GPS data already recorded is not affected.
        </p>

        {deleteError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle size={13} />{deleteError}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          >
            {deleting ? <><Spinner size={14} /> Deleting…</> : <><Trash2 size={14} /> Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sort header cell ─────────────────────────────────────────────────────────

function SortTh({
  field,
  label,
  sort,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: { field: SortField; dir: SortDir };
  onSort: (f: SortField) => void;
}) {
  const active = sort.field === field;
  return (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-400 hover:text-white transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          sort.dir === 'asc' ? <ChevronUp size={13} className="text-cyan-400" /> : <ChevronDown size={13} className="text-cyan-400" />
        ) : (
          <ChevronDown size={13} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'add' }
  | { type: 'edit'; device: DeviceRecord }
  | { type: 'delete'; device: DeviceRecord };

type ToastState = { message: string; kind: 'success' | 'error' } | null;

export default function DevicesPage() {
  // Data
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [positions, setPositions] = useState<Map<string, LatestPosition>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // UI state
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'all'>('all');
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'label', dir: 'asc' });
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, kind: 'success' | 'error') => setToast({ message, kind });

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async (bg = false) => {
    bg ? setRefreshing(true) : setLoading(true);
    setLoadError(null);
    try {
      const [devs, positions] = await Promise.all([fetchDevices(), fetchLatestPositions()]);
      setDevices(devs);
      setPositions(new Map(positions.map(p => [p.imei, p])));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleAdd = async (d: DeviceRecord) => {
    const created = await createDevice({
      imei: d.imei.trim(),
      label: d.label.trim(),
      simCard: d.simCard.trim(),
      vehicleType: d.vehicleType,
      notes: d.notes.trim(),
      assignedTo: d.assignedTo?.trim() || undefined,
    });
    setDevices(prev => [created, ...prev]);
    setModal({ type: 'none' });
    showToast(`Device ${created.label || created.imei} added successfully`, 'success');
  };

  const handleEdit = async (d: DeviceRecord) => {
    const updated = await updateDevice(d.imei, {
      label: d.label.trim(),
      simCard: d.simCard.trim(),
      vehicleType: d.vehicleType,
      notes: d.notes.trim(),
      assignedTo: d.assignedTo?.trim() || undefined,
    });
    setDevices(prev => prev.map(dev => dev.imei === updated.imei ? updated : dev));
    setModal({ type: 'none' });
    showToast(`Device ${updated.label || updated.imei} updated`, 'success');
  };

  const handleDelete = async (imei: string) => {
    await deleteDevice(imei);
    setDevices(prev => prev.filter(d => d.imei !== imei));
    setModal({ type: 'none' });
    showToast('Device removed from fleet', 'success');
  };

  // ── Filter + sort ──────────────────────────────────────────────────────────

  const toggleSort = (field: SortField) => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });
  };

  const processed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = devices.filter(d => {
      if (q && !d.imei.toLowerCase().includes(q) && !d.label.toLowerCase().includes(q) &&
          !d.simCard.toLowerCase().includes(q) && !d.vehicleType.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all') {
        const pos = positions.get(d.imei);
        if (getStatus(pos) !== statusFilter) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      let av = '', bv = '';
      if (sort.field === 'label') { av = a.label; bv = b.label; }
      else if (sort.field === 'imei') { av = a.imei; bv = b.imei; }
      else if (sort.field === 'vehicleType') { av = a.vehicleType; bv = b.vehicleType; }
      else if (sort.field === 'createdAt') { av = a.createdAt ?? ''; bv = b.createdAt ?? ''; }
      else if (sort.field === 'status') {
        av = getStatus(positions.get(a.imei));
        bv = getStatus(positions.get(b.imei));
      }
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return list;
  }, [devices, positions, query, statusFilter, sort]);

  // ── Summary counts ────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    let moving = 0, parked = 0, offline = 0, unknown = 0;
    for (const d of devices) {
      const s = getStatus(positions.get(d.imei));
      if (s === 'moving') moving++;
      else if (s === 'parked') parked++;
      else if (s === 'offline') offline++;
      else unknown++;
    }
    return { moving, parked, offline, unknown, total: devices.length };
  }, [devices, positions]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.kind} onDismiss={() => setToast(null)} />
      )}

      {/* Modals */}
      {modal.type === 'add' && (
        <DeviceFormModal mode="add" initial={EMPTY} onSubmit={handleAdd} onClose={() => setModal({ type: 'none' })} />
      )}
      {modal.type === 'edit' && (
        <DeviceFormModal mode="edit" initial={modal.device} onSubmit={handleEdit} onClose={() => setModal({ type: 'none' })} />
      )}
      {modal.type === 'delete' && (
        <DeleteModal
          device={modal.device}
          onConfirm={() => handleDelete(modal.device.imei)}
          onClose={() => setModal({ type: 'none' })}
        />
      )}

      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ── Page header ── */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Devices</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage your registered GPS trackers
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => setModal({ type: 'add' })}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              <Plus size={16} /> Add device
            </button>
          </div>
        </div>

        {/* ── Summary stat pills ── */}
        <div className="mb-6 flex flex-wrap gap-3">
          {[
            { key: 'all' as const, label: 'All devices', count: counts.total, color: 'border-slate-700 text-slate-300' },
            { key: 'moving' as const, label: 'Moving', count: counts.moving, color: 'border-cyan-500/25 text-cyan-300' },
            { key: 'parked' as const, label: 'Parked', count: counts.parked, color: 'border-amber-500/25 text-amber-300' },
            { key: 'offline' as const, label: 'Offline', count: counts.offline, color: 'border-red-500/25 text-red-400' },
          ].map(({ key, label, count, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors ${color} ${
                statusFilter === key ? 'bg-slate-800' : 'hover:bg-slate-900'
              }`}
            >
              {label}
              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{count}</span>
            </button>
          ))}
        </div>

        {/* ── Load error ── */}
        {loadError && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle size={16} />{loadError}
            <button type="button" onClick={() => void load()} className="ml-auto text-xs underline">Retry</button>
          </div>
        )}

        {/* ── Search bar ── */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
            <Search size={15} className="flex-shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by IMEI, label, SIM or vehicle type…"
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500">
            {processed.length} of {devices.length} device{devices.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Table ── */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
              <Spinner size={28} />
              <p className="text-sm">Loading devices…</p>
            </div>
          ) : processed.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
              {query || statusFilter !== 'all' ? (
                <>
                  <p className="text-sm">No devices match your filters.</p>
                  <button type="button" onClick={() => { setQuery(''); setStatusFilter('all'); }}
                    className="text-xs text-cyan-400 underline">Clear filters</button>
                </>
              ) : (
                <>
                  <p className="text-sm">No devices registered yet.</p>
                  <button type="button" onClick={() => setModal({ type: 'add' })}
                    className="flex items-center gap-1 text-xs text-cyan-400 underline">
                    <Plus size={12} /> Add your first device
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="border-b border-slate-800 bg-slate-950/50">
                  <tr>
                    <SortTh field="label"       label="Device"       sort={sort} onSort={toggleSort} />
                    <SortTh field="imei"        label="IMEI"         sort={sort} onSort={toggleSort} />
                    <SortTh field="vehicleType" label="Type"         sort={sort} onSort={toggleSort} />
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-400">SIM</th>
                    <SortTh field="status"      label="Status"       sort={sort} onSort={toggleSort} />
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-400">Assigned to</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-400">Last seen</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-slate-400">Speed</th>
                    <SortTh field="createdAt"   label="Registered"   sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {processed.map(device => {
                    const pos = positions.get(device.imei);
                    const status = getStatus(pos);
                    const meta = STATUS_META[status];

                    return (
                      <tr
                        key={device.imei}
                        className="group transition-colors hover:bg-slate-800/40"
                      >
                        {/* Device label */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`} />
                            <div>
                              <p className="font-medium text-white">
                                {device.label || <span className="italic text-slate-500">Unlabelled</span>}
                              </p>
                              {device.notes && (
                                <p className="max-w-[160px] truncate text-xs text-slate-500">{device.notes}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* IMEI */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-slate-300">{device.imei}</span>
                        </td>

                        {/* Vehicle type */}
                        <td className="px-4 py-3 text-slate-400">
                          {device.vehicleType || <span className="text-slate-600">—</span>}
                        </td>

                        {/* SIM */}
                        <td className="px-4 py-3 text-slate-400">
                          {device.simCard || <span className="text-slate-600">—</span>}
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${meta.badge}`}>
                            {status === 'moving' ? <Wifi size={10} /> : <WifiOff size={10} />}
                            {meta.label}
                          </span>
                        </td>

                        {/* Assigned to */}
                        <td className="px-4 py-3 text-xs">
                          {device.assignedTo
                            ? <span className="font-mono text-cyan-400">{device.assignedTo}</span>
                            : <span className="text-slate-600">Unassigned</span>}
                        </td>

                        {/* Last seen */}
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {formatLastSeen(pos?.time)}
                        </td>

                        {/* Speed */}
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {pos ? `${pos.speed_kph.toFixed(0)} km/h` : '—'}
                        </td>

                        {/* Registered date */}
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {formatDate(device.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              title="Edit device"
                              onClick={() => setModal({ type: 'edit', device })}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              title="Delete device"
                              onClick={() => setModal({ type: 'delete', device })}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table footer */}
          {!loading && processed.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
              <span>Showing {processed.length} of {devices.length} devices</span>
              <span>
                {counts.moving} moving · {counts.parked} parked · {counts.offline} offline
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}