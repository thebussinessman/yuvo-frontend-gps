import { useState } from "react";
import LoginPage from "./pages/LoginPage";
import type { LoginSuccessData, UserRole } from "./pages/LoginPage";
import LiveMapPage from "./pages/LiveMapPage";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard from "./pages/UserDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";

type Tab = "dashboard" | "live" | "playback" | "reports";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [userRole, setUserRole] = useState<UserRole | null>(() => {
    const savedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (!savedUser) return null;
    try {
      const user = JSON.parse(savedUser) as { role: UserRole };
      return user.role;
    } catch {
      ["token", "user", "role"].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      return null;
    }
  });

const handleLoginSuccess = (data: LoginSuccessData) => {
  setUserRole(data.user.role);
};

const handleLogout = () => {
  ["token", "user", "role"].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  setUserRole(null);
  setTab("dashboard");
};

if (!userRole) {
  return <LoginPage onLoginSuccess={handleLoginSuccess} />;
}

if (userRole === "USER") {
  return <UserDashboard />;
}

if (userRole === "OWNER") {
  return <OwnerDashboard />;
}

  return (
    <div
      className="min-h-screen bg-[#0a0c10] text-slate-100 flex flex-col"
      style={{ fontFamily: "'DM Mono', monospace" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@600;700;800&display=swap');

        ::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }

        ::-webkit-scrollbar-track {
          background: #0a0c10;
        }

        ::-webkit-scrollbar-thumb {
          background: #1e2433;
          border-radius: 2px;
        }

        .tab-active {
          color: #38bdf8;
          border-bottom: 2px solid #38bdf8;
        }

        .tab-inactive {
          color: #475569;
          border-bottom: 2px solid transparent;
        }

        .tab-inactive:hover {
          color: #94a3b8;
        }

        .pulse-dot {
          animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse-ring {
          0%, 100% {
            opacity: 1;
          }

          50% {
            opacity: 0.4;
          }
        }
      `}</style>

      {/* TOP NAVIGATION BAR */}
      <header className="h-14 border-b border-[#1a1f2e] flex items-center px-6 shrink-0 bg-[#0a0c10]">
        {/* LOGO */}
        <div className="flex items-center gap-3 mr-10">
          <div className="w-7 h-7 rounded bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2.5" fill="#38bdf8" />
              <circle
                cx="7"
                cy="7"
                r="5.5"
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </svg>
          </div>

          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "0.05em",
            }}
            className="text-white"
          >
            YUVO<span className="text-sky-400">GPS</span>
          </span>
        </div>

        {/* PAGE TABS */}
        <nav className="flex items-end gap-6 h-full">
          {[
            { id: "dashboard", label: "Dashboard", icon: "▣" },
            { id: "live", label: "Live Map", icon: "◉" },
            { id: "playback", label: "Playback", icon: "▶" },
            { id: "reports", label: "Reports", icon: "▦" },
          ].map((item) => {
            const tabItem = item as {
              id: Tab;
              label: string;
              icon: string;
            };

            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setTab(tabItem.id)}
                className={`flex items-center gap-1.5 text-xs font-medium pb-3 pt-1 transition-all duration-150 ${
                  tab === tabItem.id ? "tab-active" : "tab-inactive"
                }`}
              >
                <span style={{ fontSize: 10 }}>{tabItem.icon}</span>
                {tabItem.label}
              </button>
            );
          })}
        </nav>

        {/* CONNECTION STATUS */}
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
            <span>TCP :5000</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>API :3000</span>
          </div>

          <div className="hidden md:block h-4 w-px bg-slate-800" />

          <div className="text-xs text-slate-600 font-mono">
            {new Date().toLocaleTimeString("en-ZM", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>

          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* PAGE CONTENT */}
      <main className="flex-1 overflow-auto">
        {tab === "dashboard" && <AdminDashboard />}

        {tab === "live" && <LiveMapPage />}

        {tab === "playback" && (
          <PlaceholderPage
            icon="▶"
            title="Playback"
            desc="Select a vehicle and date range to replay its route."
          />
        )}

        {tab === "reports" && (
          <PlaceholderPage
            icon="▦"
            title="Reports"
            desc="Trip summaries, distance, idle time and fuel estimates."
          />
        )}
      </main>
    </div>
  );
}

function PlaceholderPage({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="h-full min-h-[500px] flex items-center justify-center flex-col gap-4">
      <div className="w-12 h-12 rounded-xl border border-slate-800 flex items-center justify-center text-slate-600 text-xl">
        {icon}
      </div>

      <div
        style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 700,
        }}
        className="text-slate-400 text-sm tracking-widest uppercase"
      >
        {title}
      </div>

      <div className="text-xs text-slate-600">{desc}</div>
    </div>
  );
}
