import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/lib/brand";
import { isLoggedIn, setLoggedIn } from "@/lib/auth";
import { RotateCw, LogOut, Search } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const TABS = [
  { to: "/", label: "Home" },
  { to: "/email", label: "Email" },
  { to: "/sms", label: "SMS" },
  { to: "/whatsapp", label: "WhatsApp" },
  { to: "/calls", label: "Calls" },
] as const;

const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes
const WARN_BEFORE_MS = 30 * 1000;     // show warning 30 s before logout

function AppLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn()) {
      navigate({ to: "/login" });
    } else {
      setReady(true);
    }
  }, [navigate]);

  // ── Inactivity logout ─────────────────────────────────────────────────────
  const doLogout = useCallback(() => {
    setLoggedIn(false);
    navigate({ to: "/login" });
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    setShowWarning(false);
    // warn at 4:30, log out at 5:00
    warnTimerRef.current = setTimeout(() => setShowWarning(true), INACTIVITY_MS - WARN_BEFORE_MS);
    logoutTimerRef.current = setTimeout(doLogout, INACTIVITY_MS);
  }, [doLogout]);

  useEffect(() => {
    if (!ready) return;

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // start the clock on first render

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    };
  }, [ready, resetTimer]);

  // ─────────────────────────────────────────────────────────────────────────
  if (!ready) return <div className="min-h-screen" style={{ backgroundColor: "#FFEBCE" }} />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFEBCE" }}>
      <header className="bg-white border-b-2 sticky top-0 z-10" style={{ borderColor: "#86000B" }}>
        <div className="px-6 h-16 flex items-center gap-8">
          <Logo />
          <nav className="flex gap-1">
            {TABS.map((t) => {
              const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className="px-4 py-2 text-sm font-semibold rounded-md transition-colors"
                  style={{
                    color: active ? "#FFFFFF" : "#1B2419",
                    backgroundColor: active ? "#86000B" : "transparent",
                  }}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                placeholder="Search…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none w-56"
              />
            </div>
            <button
              onClick={() => window.location.reload()}
              className="p-2 rounded-md hover:bg-gray-100"
              title="Reload"
            >
              <RotateCw className="w-4 h-4" style={{ color: "#86000B" }} />
            </button>
            <button
              onClick={doLogout}
              className="px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 rounded-md text-white"
              style={{ backgroundColor: "#86000B" }}
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="p-6">
        <Outlet />
      </main>

      {/* ── Inactivity warning banner ──────────────────────────────────────── */}
      {showWarning && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 px-6 py-3 flex items-center justify-between shadow-lg"
          style={{ backgroundColor: "#86000B" }}
        >
          <span className="text-sm text-white">
            You'll be signed out in 30 seconds due to inactivity.
          </span>
          <button
            onClick={resetTimer}
            className="ml-4 px-4 py-1.5 rounded-md text-sm font-semibold bg-white hover:bg-gray-100 transition-colors"
            style={{ color: "#86000B" }}
          >
            Stay signed in
          </button>
        </div>
      )}
    </div>
  );
}
