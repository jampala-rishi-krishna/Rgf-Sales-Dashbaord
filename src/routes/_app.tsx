import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/hooks/use-me";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileTabBar } from "@/components/shell/MobileTabBar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { NotificationCenter } from "@/components/shell/NotificationCenter";
import { NAV, isActive, useShellFeeds } from "@/components/shell/nav";
import { Skeleton } from "@/components/shared";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes
const WARN_BEFORE_MS = 30 * 1000; // warning 30 s before logout
const COLLAPSE_KEY = "rgf-sidebar-collapsed";

function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wall = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)?.wall ?? "") === "1",
  });
  const me = useMe();
  const user = me.data?.user ?? null;
  const ready = !!user;

  const [showWarning, setShowWarning] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth gate (server session) ───────────────────────────────────────────
  useEffect(() => {
    if (me.isSuccess && !me.data.user) void navigate({ to: "/login", replace: true });
  }, [me.isSuccess, me.data, navigate]);

  // ── Sidebar collapse persistence ─────────────────────────────────────────
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  // ── ⌘K / Ctrl+K ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Logout ───────────────────────────────────────────────────────────────
  const doLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* still leave the app */
    }
    queryClient.clear();
    void navigate({ to: "/login", replace: true });
  }, [navigate, queryClient]);

  // ── Inactivity logout (disabled on Live Wall) ────────────────────────────
  const resetTimer = useCallback(() => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    setShowWarning(false);
    warnTimerRef.current = setTimeout(() => setShowWarning(true), INACTIVITY_MS - WARN_BEFORE_MS);
    logoutTimerRef.current = setTimeout(() => void doLogout(), INACTIVITY_MS);
  }, [doLogout]);

  useEffect(() => {
    if (!ready || wall) return;
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      setShowWarning(false);
    };
  }, [ready, wall, resetTimer]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh bg-background">
        <div className="hidden w-60 border-r bg-surface p-3 md:block">
          <Skeleton className="mb-6 h-8 w-28" />
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-8 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="mb-6 h-8 w-64" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ShellFrame
      pathname={pathname}
      wall={wall}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      paletteOpen={paletteOpen}
      setPaletteOpen={setPaletteOpen}
      user={user}
      dryRun={me.data?.dryRun ?? true}
      onLogout={() => void doLogout()}
      showWarning={showWarning}
      onStay={resetTimer}
    />
  );
}

/** Split so feed polling only starts once the session is confirmed. */
function ShellFrame(p: {
  pathname: string;
  wall: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  user: { name: string; email: string; role: string };
  dryRun: boolean;
  onLogout: () => void;
  showWarning: boolean;
  onStay: () => void;
}) {
  const feeds = useShellFeeds();
  const current = NAV.find((n) => isActive(p.pathname, n.to));
  const title = current?.to === "/" ? "Mission Control" : (current?.label ?? "RGF");

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <Sidebar
        pathname={p.pathname}
        collapsed={p.collapsed}
        onToggle={p.onToggleCollapsed}
        counts={feeds.counts}
        wall={p.wall}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          onOpenPalette={() => p.setPaletteOpen(true)}
          fresh={feeds.fresh}
          newest={feeds.newest}
          dryRun={p.dryRun}
          user={p.user}
          onLogout={p.onLogout}
          wall={p.wall}
          notifications={
            <NotificationCenter
              feeds={{ whatsapp: feeds.wa, sms: feeds.sms, viber: feeds.viber }}
            />
          }
        />
        <main className="min-w-0 flex-1 px-3 pt-4 pb-24 md:px-6 md:pt-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      <MobileTabBar pathname={p.pathname} counts={feeds.counts} wall={p.wall} />
      <CommandPalette
        open={p.paletteOpen}
        onOpenChange={p.setPaletteOpen}
        feeds={{ whatsapp: feeds.wa, sms: feeds.sms, viber: feeds.viber }}
        wall={p.wall}
      />

      {p.showWarning && (
        <div
          role="alertdialog"
          aria-live="assertive"
          className="fixed inset-x-3 bottom-20 z-50 flex items-center justify-between gap-3 rounded-xl bg-[var(--rgf-red)] px-4 py-3 text-white shadow-lg md:inset-x-auto md:right-6 md:bottom-6 md:w-[420px]"
        >
          <span className="text-sm">You'll be signed out in 30 seconds due to inactivity.</span>
          <button
            type="button"
            onClick={p.onStay}
            className="shrink-0 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-[var(--rgf-red)] hover:bg-white/90"
          >
            Stay signed in
          </button>
        </div>
      )}
    </div>
  );
}
