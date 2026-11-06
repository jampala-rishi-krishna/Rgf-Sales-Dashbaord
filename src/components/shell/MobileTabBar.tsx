import { Link } from "@tanstack/react-router";
import { Database, Home, Inbox, Megaphone, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChannelGlyph } from "@/components/shared";
import { cn } from "@/lib/utils";
import { NAV, isActive, type CountKey } from "./nav";

const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/inbox", label: "Inbox", icon: Inbox, countKey: "inbox" as CountKey },
  { to: "/crm", label: "CRM", icon: Database },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, action: true },
];

export function MobileTabBar({
  pathname,
  counts,
  wall,
}: {
  pathname: string;
  counts: Record<CountKey, number>;
  wall?: boolean;
}) {
  const [more, setMore] = useState(false);
  const tabs = wall ? TABS.filter((t) => !t.action) : TABS;
  const primary = new Set(TABS.map((t) => t.to));
  const rest = NAV.filter((n) => !primary.has(n.to) && !(wall && n.action));
  const moreActive = rest.some((n) => isActive(pathname, n.to));

  const cls = (active: boolean) =>
    cn(
      "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium",
      active ? "text-[var(--rgf-red)] dark:text-[#E8505E]" : "text-muted-foreground",
    );

  return (
    <>
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-surface md:hidden"
        aria-label="Primary"
      >
        <div className="flex h-14">
          {tabs.map((t) => {
            const active = isActive(pathname, t.to);
            const count = t.countKey ? counts[t.countKey] : 0;
            return (
              <Link
                key={t.to}
                to={t.to as "/"}
                className={cls(active)}
                aria-current={active ? "page" : undefined}
              >
                <span className="relative">
                  <t.icon className="size-5" />
                  {count > 0 && (
                    <span className="font-mono-num absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-[var(--rgf-red)] px-1 text-center text-[10px] leading-4 text-white">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>
                {t.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={cls(moreActive)}
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
        >
          <SheetHeader>
            <SheetTitle>Channels</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {rest.map((n) => {
              const count = n.countKey ? counts[n.countKey] : 0;
              return (
                <Link
                  key={n.to}
                  to={n.to as "/"}
                  onClick={() => setMore(false)}
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium",
                    isActive(pathname, n.to) ? "border-[var(--rgf-red)] bg-muted" : "bg-surface",
                  )}
                >
                  {n.channel ? (
                    <ChannelGlyph channel={n.channel} size={22} />
                  ) : n.icon ? (
                    <n.icon className="size-[22px]" />
                  ) : null}
                  {n.label}
                  {count > 0 && (
                    <span className="font-mono-num absolute top-1.5 right-1.5 rounded-full bg-[var(--rgf-green)] px-1.5 text-[10px] leading-4 text-white">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
