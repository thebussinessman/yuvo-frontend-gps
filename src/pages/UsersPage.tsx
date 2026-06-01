import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

// ─── Shared storage helpers ───────────────────────────────────────────────────
// Exported so LoginPage and UserDashboard can read/write the same list.

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'OWNER';
  password: string;
  createdAt: string;
};

const STORAGE_KEY = 'yuvo_users';

export function loadManagedUsers(): ManagedUser[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ManagedUser[];
  } catch {
    return [];
  }
}

export function saveManagedUsers(users: ManagedUser[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'add' }
  | { type: 'edit'; user: ManagedUser }
  | { type: 'delete'; user: ManagedUser };

type ToastState = { message: string; kind: 'success' | 'error' } | null;

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ' +
  'focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors placeholder:text-slate-600';

const labelCls = 'mb-1.5 block text-xs font-medium text-slate-400';

// ─── Toast ────────────────────────────────────────────────────────────────────

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
      <button type="button" onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── User form modal (Add / Edit) ─────────────────────────────────────────────

type UserFormProps = {
  mode: 'add' | 'edit';
  initial: Partial<ManagedUser>;
  emailTaken: (email: string) => boolean;
  onSubmit: (u: ManagedUser) => void;
  onClose: () => void;
};

function UserFormModal({ mode, initial, emailTaken, onSubmit, onClose }: UserFormProps) {
  const [name, setName] = useState(initial.name ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [role, setRole] = useState<'USER' | 'OWNER'>(initial.role ?? 'USER');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [resetPwd, setResetPwd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwdRequired = mode === 'add' || resetPwd;
  const canSubmit =
    name.trim().length >= 2 &&
    emailValid &&
    (!pwdRequired || password.length >= 6);

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (mode === 'add' && emailTaken(email.trim().toLowerCase())) {
      setFormError('A user with this email already exists.');
      return;
    }
    const user: ManagedUser = {
      id: initial.id ?? genId(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      password: pwdRequired ? password : (initial.password ?? ''),
      createdAt: initial.createdAt ?? new Date().toISOString(),
    };
    onSubmit(user);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/75 px-4 py-12"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              {mode === 'add' ? 'Create user' : 'Edit user'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {mode === 'add'
                ? 'Set credentials the user will log in with'
                : `Editing ${initial.email}`}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {formError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertTriangle size={14} /> {formError}
            </div>
          )}

          <div>
            <label className={labelCls}>Full name <span className="text-red-400">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. John Banda" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Email <span className="text-red-400">*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. john@yuvoafrica.com"
              disabled={mode === 'edit'}
              className={`${inputCls} ${mode === 'edit' ? 'cursor-not-allowed opacity-50' : ''}`}
            />
          </div>

          <div>
            <label className={labelCls}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value as 'USER' | 'OWNER')}
              className={inputCls}>
              <option value="USER">User — fleet viewer</option>
              <option value="OWNER">Owner — fleet manager</option>
            </select>
          </div>

          {mode === 'add' && (
            <div>
              <label className={labelCls}>Initial password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className={`${inputCls} pr-10`}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Share this with the user — they can change it in their profile.
              </p>
            </div>
          )}

          {mode === 'edit' && (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={resetPwd}
                  onChange={e => { setResetPwd(e.target.checked); setPassword(''); }}
                  className="accent-cyan-400"
                />
                Reset password
              </label>
              {resetPwd && (
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className={`${inputCls} pr-10`}
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex min-w-[120px] items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 transition-opacity"
          >
            {mode === 'add' ? 'Create user' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({ user, onConfirm, onClose }: { user: ManagedUser; onConfirm: () => void; onClose: () => void }) {
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
            <h3 className="text-base font-semibold text-white">Remove user?</h3>
            <p className="text-xs text-slate-500">This cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-white">{user.name}</span>{' '}
          <span className="font-mono text-xs text-slate-500">({user.email})</span>{' '}
          will lose access to the platform immediately.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 transition-colors">
            <Trash2 size={14} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  return role === 'OWNER'
    ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-300"><Shield size={10} />Owner</span>
    : <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-300"><Users size={10} />User</span>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>(() => loadManagedUsers());
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [toast, setToast] = useState<ToastState>(null);

  const persist = (updated: ManagedUser[]) => {
    saveManagedUsers(updated);
    setUsers(updated);
  };

  const handleAdd = (u: ManagedUser) => {
    persist([u, ...users]);
    setModal({ type: 'none' });
    setToast({ message: `User ${u.name} created`, kind: 'success' });
  };

  const handleEdit = (u: ManagedUser) => {
    persist(users.map(x => x.id === u.id ? u : x));
    setModal({ type: 'none' });
    setToast({ message: `${u.name} updated`, kind: 'success' });
  };

  const handleDelete = (id: string) => {
    persist(users.filter(u => u.id !== id));
    setModal({ type: 'none' });
    setToast({ message: 'User removed', kind: 'success' });
  };

  const emailTaken = (email: string) =>
    users.some(u => u.email.toLowerCase() === email.toLowerCase());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? users.filter(u =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q),
        )
      : users;
  }, [users, query]);

  const userCount = users.filter(u => u.role === 'USER').length;
  const ownerCount = users.filter(u => u.role === 'OWNER').length;

  return (
    <div className="space-y-6">
      {toast && (
        <Toast message={toast.message} type={toast.kind} onDismiss={() => setToast(null)} />
      )}

      {modal.type === 'add' && (
        <UserFormModal mode="add" initial={{}} emailTaken={emailTaken}
          onSubmit={handleAdd} onClose={() => setModal({ type: 'none' })} />
      )}
      {modal.type === 'edit' && (
        <UserFormModal mode="edit" initial={modal.user} emailTaken={emailTaken}
          onSubmit={handleEdit} onClose={() => setModal({ type: 'none' })} />
      )}
      {modal.type === 'delete' && (
        <DeleteModal user={modal.user}
          onConfirm={() => handleDelete(modal.user.id)}
          onClose={() => setModal({ type: 'none' })} />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Users</h2>
          <p className="mt-1 text-sm text-slate-400">Manage platform access and credentials</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ type: 'add' })}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
        >
          <UserPlus size={16} /> Create user
        </button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 min-w-[110px]">
          <p className="text-xs text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-white">{users.length}</p>
        </div>
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 min-w-[110px]">
          <p className="text-xs text-slate-500">Fleet viewers</p>
          <p className="mt-1 text-2xl font-semibold text-cyan-300">{userCount}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 min-w-[110px]">
          <p className="text-xs text-slate-500">Fleet managers</p>
          <p className="mt-1 text-2xl font-semibold text-amber-300">{ownerCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
        <Search size={15} className="flex-shrink-0 text-slate-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, email or role…"
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="text-slate-500 hover:text-white">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
            {users.length === 0 ? (
              <>
                <p className="text-sm">No users created yet.</p>
                <button type="button" onClick={() => setModal({ type: 'add' })}
                  className="flex items-center gap-1 text-xs text-cyan-400 underline">
                  <Plus size={12} /> Create the first user
                </button>
              </>
            ) : (
              <p className="text-sm">No users match your search.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-400">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-400">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-400">Role</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-slate-400">Created</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(u => (
                  <tr key={u.id} className="group transition-colors hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-white">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">{u.email}</td>
                    <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" title="Edit user"
                          onClick={() => setModal({ type: 'edit', user: u })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" title="Remove user"
                          onClick={() => setModal({ type: 'delete', user: u })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            Showing {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
