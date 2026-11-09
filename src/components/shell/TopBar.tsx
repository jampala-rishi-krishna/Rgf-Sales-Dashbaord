import { LogOut, Moon, RefreshCw, Search, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LiveDot } from "@/components/shared";
import { useTheme } from "@/hooks/use-theme";
import { LogoMark } from "@/lib/brand";
import { formatManila } from "@/lib/channels";

/** Re-fetches every query on the current page (conversations, calls, leads, counts…). */
function RefreshButton() {
  const qc = useQueryClient();
  const router = useRouter();
  const fetching = useIsFetching();
  const [busy, setBusy] = useState(false);
  const spinning = busy || fetching > 0;

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      await router.invalidate();
      await qc.invalidateQueries({ refetchType: "active" });
      toast.success("Refreshed", { duration: 1500 });
    } catch {
      toast.error("Some data could not be refreshed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={busy}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-70 sm:px-2.5"
      aria-label="Refresh data"
      title="Refresh all data on this page"
    >
      <RefreshCw className={`size-[18px] ${spinning ? "animate-spin" : ""}`} aria-hidden />
      <span className="hidden lg:inline">{busy ? "Refreshing…" : "Refresh"}</span>
    </button>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function TopBar({
  title,
  onOpenPalette,
  fresh,
  newest,
  dryRun,
  user,
  onLogout,
  notifications,
  wall,
}: {
  title: string;
  onOpenPalette: () => void;
  fresh: boolean;
  newest: number;
  dryRun: boolean;
  user: { name: string; email: string; role: string } | null;
  onLogout: () => void;
  notifications: ReactNode;
  wall?: boolean;
}) {
  const { theme, toggle } = useTheme();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] px-3 backdrop-blur md:px-5">
      <LogoMark size={28} className="md:hidden" />
      <h1 className="truncate text-sm font-semibold text-foreground md:text-base">{title}</h1>
      {dryRun && (
        <span
          className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold tracking-wide text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
          title="ACTIONS_DRY_RUN is on: sends are simulated"
        >
          DRY RUN
        </span>
      )}
      {wall && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          Live Wall
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 sm:flex"
          aria-label="Open command palette"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted sm:hidden"
          aria-label="Search"
        >
          <Search className="size-[18px]" />
        </button>

        <span
          className="mx-1 hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground sm:inline-flex"
          title={
            newest
              ? `Last update ${formatManila(newest, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Waiting for first update"
          }
        >
          <LiveDot fresh={fresh} />
          {fresh ? "Live" : "Stale"}
        </span>
        <LiveDot fresh={fresh} className="mx-1 sm:hidden" />

        <RefreshButton />

        {notifications}

        <button
          type="button"
          onClick={toggle}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-1 inline-flex size-8 items-center justify-center rounded-full bg-[var(--rgf-green)] text-xs font-semibold text-white ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Account: ${user.name}`}
              >
                {initials(user.name || user.email)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="space-y-0.5">
                <div className="truncate text-sm font-semibold">{user.name || user.email}</div>
                <div className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </div>
                <div className="pt-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {user.role}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogout}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
