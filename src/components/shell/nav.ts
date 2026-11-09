import { Home, Inbox, Megaphone, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasReplied, type ChannelKey, type Conversation } from "@/lib/channels";
import { useSmsFeed, useViberFeed, useWhatsAppFeed } from "@/hooks/use-feeds";

export type NavItem = {
  to: string;
  label: string;
  icon?: LucideIcon;
  channel?: ChannelKey;
  countKey?: CountKey;
  action?: boolean;
};
export type CountKey = "inbox" | "whatsapp" | "sms" | "viber";

export const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/inbox", label: "Inbox", icon: Inbox, countKey: "inbox" },
  { to: "/whatsapp", label: "WhatsApp", channel: "whatsapp", countKey: "whatsapp" },
  { to: "/viber", label: "Viber", channel: "viber", countKey: "viber" },
  { to: "/sms", label: "SMS", channel: "sms", countKey: "sms" },
  { to: "/email", label: "Email", channel: "email" },
  { to: "/calls", label: "Calls", channel: "voice" },
  { to: "/website", label: "Website", channel: "web" },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, action: true },
];

export function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

const DAY = 24 * 60 * 60 * 1000;

function repliedRecently(items: Conversation[], now: number) {
  return items.filter(
    (c) => hasReplied(c) && now - new Date(c.lastMessageAt || c.lastUpdated).getTime() < DAY,
  ).length;
}

/** Ticks every `ms` so time-relative values (freshness, 24h windows) re-evaluate. */
export function useNow(ms = 5_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Cheap sidebar badges + freshness, derived from the shared (already polled) conversation feeds. */
export function useShellFeeds() {
  const wa = useWhatsAppFeed();
  const sms = useSmsFeed();
  const viber = useViberFeed();
  const now = useNow(5_000);

  const counts = useMemo(() => {
    const w = wa.data?.items ?? [];
    const s = sms.data?.items ?? [];
    const v = viber.data?.items ?? [];
    const escalated = [...w, ...s, ...v].filter(
      (c) => c.humanEscalated && !c.meetingScheduled,
    ).length;
    return {
      inbox: escalated,
      whatsapp: repliedRecently(w, now),
      sms: repliedRecently(s, now),
      viber: repliedRecently(v, now),
    } satisfies Record<CountKey, number>;
    // `now` intentionally refreshed only every minute-ish via useNow; cheap filter anyway.
  }, [wa.data, sms.data, viber.data, now]);

  const newest = Math.max(wa.dataUpdatedAt || 0, sms.dataUpdatedAt || 0, viber.dataUpdatedAt || 0);
  const fresh = newest > 0 && now - newest < 30_000;

  return {
    counts,
    fresh,
    newest,
    // undefined (not []) until loaded, so NotificationCenter seeds its baseline from the
    // first real response instead of toasting every existing reply as "new".
    wa: wa.data?.items,
    sms: sms.data?.items,
    viber: viber.data?.items,
    viberConnected: viber.data?.connected ?? false,
  };
}
