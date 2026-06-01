import { useState } from "react";
import type { FormEvent } from "react";
import { loadManagedUsers } from "./UsersPage";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";

export type UserRole = "ADMIN" | "OWNER" | "USER";

export interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginSuccessData {
  token: string;
  user: AuthUser;
}

interface LoginPageProps {
  onLoginSuccess: (data: LoginSuccessData) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password to continue.");
      return;
    }

    setIsAuthenticating(true);

    try {
      /*
        Replace this mock section later with your NestJS backend request:

        const response = await fetch("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          throw new Error("Invalid credentials");
        }

        const data: LoginSuccessData = await response.json();
      */

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Temporary login accounts for frontend testing
      let data: LoginSuccessData;

      if (email === "admin@yuvoafrica.com" && password === "admin123") {
        data = {
          token: "temporary-admin-token",
          user: {
            name: "System Administrator",
            email,
            role: "ADMIN",
          },
        };
      } else if (email === "owner@yuvoafrica.com" && password === "owner123") {
        data = {
          token: "temporary-owner-token",
          user: { name: "Yuvo Owner", email, role: "OWNER" },
        };
      } else if (email === "user@yuvoafrica.com" && password === "user123") {
        data = {
          token: "temporary-user-token",
          user: { name: "Fleet User", email, role: "USER" },
        };
      } else {
        const managed = loadManagedUsers().find(
          u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
        );
        if (!managed) throw new Error("Invalid credentials");
        data = {
          token: `token-${managed.id}`,
          user: { name: managed.name, email: managed.email, role: managed.role },
        };
      }

      const storage = rememberSession ? localStorage : sessionStorage;
      storage.setItem("token", data.token);
      storage.setItem("user", JSON.stringify(data.user));
      storage.setItem("role", data.user.role);

      onLoginSuccess(data);
    } catch {
      setError("Invalid credentials. Please check your email and password.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#0a0c10] text-slate-100 flex"
      style={{ fontFamily: "'DM Mono', monospace" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@600;700;800&display=swap');
        
        .heading-font {
          font-family: 'Syne', sans-serif;
        }

        .grid-background {
          background-image:
            linear-gradient(rgba(30, 41, 59, 0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30, 41, 59, 0.18) 1px, transparent 1px);
          background-size: 42px 42px;
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #e2e8f0;
          -webkit-box-shadow: 0 0 0px 1000px #11151d inset;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      {/* Left panel */}
      <section className="hidden lg:flex lg:w-[52%] relative overflow-hidden border-r border-slate-800/70 grid-background">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-emerald-500/5" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl border border-sky-400/30 bg-sky-400/10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-sky-400" />
            </div>

            <div>
              <p className="heading-font text-xl font-bold tracking-wide">
                YUVO GPS
              </p>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                Fleet Intelligence
              </p>
            </div>
          </div>

          <div className="max-w-lg">
            <p className="text-sky-400 text-xs uppercase tracking-[0.35em] mb-5">
              Secure Operations Portal
            </p>

            <h1 className="heading-font text-5xl xl:text-6xl font-bold leading-[1.05] mb-6">
              Vehicle tracking.
              <br />
              <span className="text-slate-500">Under control.</span>
            </h1>

            <p className="text-slate-400 leading-7 max-w-md">
              Real-time vehicle monitoring, playback history and operational
              reports for authorised Yuvo personnel.
            </p>
          </div>

          <div className="flex items-center gap-8 text-xs text-slate-500">
            <StatusItem label="Platform" value="ONLINE" active />
            <StatusItem label="Security" value="ENCRYPTED" active />
            <StatusItem label="Access" value="RESTRICTED" />
          </div>
        </div>
      </section>

      {/* Login form */}
      <main className="flex-1 flex items-center justify-center px-6 py-10 relative">
        <div className="absolute inset-0 lg:hidden grid-background opacity-40" />

        <div className="relative z-10 w-full max-w-[430px]">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="h-11 w-11 rounded-xl border border-sky-400/30 bg-sky-400/10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-sky-400" />
            </div>

            <div>
              <p className="heading-font text-xl font-bold tracking-wide">
                YUVO GPS
              </p>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                Fleet Intelligence
              </p>
            </div>
          </div>

          <div className="mb-9">
            <p className="text-xs uppercase tracking-[0.3em] text-sky-400 mb-4">
              Authentication Required
            </p>

            <h2 className="heading-font text-3xl font-bold text-white mb-3">
              Sign in
            </h2>

            <p className="text-sm text-slate-500">
              Access the Yuvo GPS management platform.
            </p>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">
                  Authentication failed
                </p>
                <p className="text-xs text-red-300/70 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.25em] text-slate-500 mb-3">
                Email Address
              </label>

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-slate-500" />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@yuvoafrica.com"
                  autoComplete="email"
                  className="w-full h-14 rounded-xl border border-slate-800 bg-[#11151d] pl-12 pr-4 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/10"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.25em] text-slate-500 mb-3">
                Password
              </label>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-slate-500" />

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full h-14 rounded-xl border border-slate-800 bg-[#11151d] pl-12 pr-12 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberSession}
                  onChange={(event) =>
                    setRememberSession(event.target.checked)
                  }
                  className="h-4 w-4 accent-sky-400"
                />
                Keep me signed in
              </label>

              <button
                type="button"
                className="text-xs text-sky-400 transition hover:text-sky-300"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="group mt-4 w-full h-14 rounded-xl border border-sky-400/30 bg-sky-500/15 text-sky-300 font-medium flex items-center justify-center gap-3 transition hover:bg-sky-500/25 hover:border-sky-400/50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAuthenticating ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-sky-300/30 border-t-sky-300 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Access Platform
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 rounded-xl border border-slate-800/80 bg-[#11151d]/60 px-4 py-4 flex gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />

            <p className="text-xs leading-5 text-slate-500">
              Access is restricted to authorised Yuvo personnel. Sessions are
              securely authenticated and role-controlled.
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-4 space-y-2">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 mb-3">Dev credentials</p>
            {[
              { role: "Admin", email: "admin@yuvoafrica.com", password: "admin123" },
              { role: "Owner", email: "owner@yuvoafrica.com", password: "owner123" },
              { role: "User",  email: "user@yuvoafrica.com",  password: "user123"  },
            ].map(({ role, email: e, password: p }) => (
              <button
                key={role}
                type="button"
                onClick={() => { setEmail(e); setPassword(p); }}
                className="w-full flex items-center justify-between rounded-lg border border-slate-800 bg-[#11151d] px-3 py-2 text-xs text-slate-400 hover:border-sky-400/40 hover:text-slate-200 transition"
              >
                <span className="font-medium text-slate-300">{role}</span>
                <span className="font-mono text-slate-500">{e}</span>
              </button>
            ))}
          </div>

          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-slate-600 mt-10">
            Yuvo Car Rentals & Logistics · GPS Control System
          </p>
        </div>
      </main>
    </div>
  );
}

interface StatusItemProps {
  label: string;
  value: string;
  active?: boolean;
}

function StatusItem({ label, value, active }: StatusItemProps) {
  return (
    <div>
      <p className="uppercase tracking-[0.22em] mb-2">{label}</p>

      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            active ? "bg-emerald-400" : "bg-slate-600"
          }`}
        />
        <span className={active ? "text-slate-300" : "text-slate-500"}>
          {value}
        </span>
      </div>
    </div>
  );
}