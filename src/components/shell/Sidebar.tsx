import { Link } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ChannelGlyph, ChannelDot } from "@/components/shared";
import { Logo, LogoMark } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/use-me";
import { isActive, visibleNav, type CountKey } from "./nav";

export function Sidebar({
  pathname,
  collapsed,
  onToggle,
  counts,
  wall,
}: {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  counts: Record<CountKey, number>;
  wall?: boolean;
}) {
  const nav = visibleNav(useMe().data?.flags);
  const items = wall ? nav.filter((n) => !n.action) : nav;
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-60",
      )}
      aria-label="Primary"
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b px-4",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? <LogoMark /> : <Logo />}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item, i) => {
          const active = isActive(pathname, item.to);
          const count = item.countKey ? counts[item.countKey] : 0;
          const Icon = item.icon;
          const showDivider = i > 0 && !!item.channel !== !!items[i - 1].channel;
          return (
            <div key={item.to}>
              {showDivider && <div className="mx-2 my-2 h-px bg-border" aria-hidden />}
              <Link
                to={item.to as "/"}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active &&
                    "bg-[color-mix(in_srgb,var(--rgf-red)_9%,transparent)] text-foreground dark:bg-[color-mix(in_srgb,var(--rgf-red)_28%,transparent)]",
                  collapsed && "justify-center px-0",
                )}
              >
                {active && (
                  <span
                    className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[var(--rgf-red)] dark:bg-[#E8505E]"
                    aria-hidden
                  />
                )}
                <span className="relative flex size-5 items-center justify-center">
                  {item.channel ? (
                    <ChannelGlyph channel={item.channel} size={16} />
                  ) : Icon ? (
                    <Icon className="size-[18px]" />
                  ) : null}
                  {collapsed && count > 0 && (
                    <span
                      className="absolute -top-1 -right-1.5 size-2 rounded-full bg-[var(--rgf-red)] ring-2 ring-surface"
                      aria-hidden
                    />
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.channel && count === 0 && (
                      <ChannelDot channel={item.channel} className="opacity-60" />
                    )}
                    {count > 0 && (
                      <span
                        className="font-mono-num min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold text-white"
                        style={{
                          backgroundColor:
                            item.countKey === "inbox"
                              ? "var(--rgf-red)"
                              : `var(--nav-badge, #33673B)`,
                        }}
                        aria-label={`${count} ${item.countKey === "inbox" ? "need a human" : "replied in 24h"}`}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "m-2 flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
          collapsed && "justify-center px-0",
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <PanelLeftOpen className="size-[18px]" />
        ) : (
          <PanelLeftClose className="size-[18px]" />
        )}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
