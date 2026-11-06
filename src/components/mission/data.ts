// Mission Control data layer: shared feeds + activity + derived stats. Client-only helpers.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useSmsFeed,
  useVapiFeed,
  useViberFeed,
  useWebsiteFeed,
  useWhatsAppFeed,
} from "@/hooks/use-feeds";
import { getJson, usePolling } from "@/hooks/use-polling";
import { fetchSheet, EMAIL_SHEET_ID, type EmailRow } from "@/lib/sheets";
import { CHANNELS, hasReplied, type ChannelKey, type Conversation } from "@/lib/channels";
import {
  isLiveCall,
  isTransferredCall,
  type AgentEvent,
  type VapiCallLike,
  type WebsiteSessionLike,
} from "@/lib/events";

export type PodKey = "whatsapp" | "sms" | "viber" | "email" | "voice" | "web";
export const POD_KEYS: PodKey[] = ["whatsapp", "sms", "viber", "email", "voice", "web"];
export type ConvChannel = "whatsapp" | "sms" | "viber";

export type ActivityResponse = {
  events: AgentEvent[];
  sources: Record<string, boolean>;
  generatedAt?: string;
};

// ── time helpers (Manila = UTC+8, no DST) ───────────────────────────────────
const MANILA_OFFSET = 8 * 3600_000;
export const manilaDate = (ts: string | number | Date) =>
  new Date(new Date(ts).getTime() + MANILA_OFFSET);
export const manilaDayKey = (ts: string | number | Date) =>
  manilaDate(ts).toISOString().slice(0, 10);
export const todayKey = () => manilaDayKey(Date.now());
export const isToday = (ts?: string) =>
  !!ts && !Number.isNaN(Date.parse(ts)) && manilaDayKey(ts) === todayKey();
export const ageMs = (ts?: string) => (ts ? Date.now() - Date.parse(ts) : Infinity);

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(manilaDayKey(Date.now() - i * 86_400_000));
  return out;
}
export function dailySeries(timestamps: (string | undefined)[], n = 14): number[] {
  const days = lastNDays(n);
  const idx = new Map(days.map((d, i) => [d, i]));
  const arr = new Array(n).fill(0) as number[];
  for (const t of timestamps) {
    if (!t || Number.isNaN(Date.parse(t))) continue;
    const i = idx.get(manilaDayKey(t));
    if (i != null) arr[i]++;
  }
  return arr;
}

export function timeAgo(ts?: string) {
  const ms = ageMs(ts);
  if (!Number.isFinite(ms)) return "";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ── link helpers ────────────────────────────────────────────────────────────
export function channelHref(
  channel: ChannelKey | string,
  opts: { phone?: string; sessionId?: string } = {},
) {
  const route = CHANNELS[channel as ChannelKey]?.route ?? "/";
  if (channel === "web" && opts.sessionId)
    return `${route}?session=${encodeURIComponent(opts.sessionId)}`;
  if (opts.phone) return `${route}?phone=${encodeURIComponent(opts.phone)}`;
  return route;
}
export function eventHref(e: AgentEvent) {
  return channelHref(e.channel, {
    phone: e.phone,
    sessionId: (e.meta?.sessionId as string | undefined) ?? undefined,
  });
}

// ── hooks ───────────────────────────────────────────────────────────────────
export function useActivity(ms = 10_000) {
  return usePolling<ActivityResponse>(
    ["activity"],
    () => getJson<ActivityResponse>("/api/activity"),
    ms,
  );
}

export function useEmailSheet() {
  return useQuery({
    queryKey: ["emails"],
    queryFn: () => fetchSheet<EmailRow>(EMAIL_SHEET_ID, "Sent Log"),
    refetchInterval: 60_000,
    enabled: !!EMAIL_SHEET_ID,
  });
}

/** Parse "Date_Sent" + "Time_Sent" sheet values into an ISO string (best-effort). */
export function emailRowTs(r: EmailRow): string | undefined {
  const raw = `${r.Date_Sent ?? ""} ${r.Time_Sent ?? ""}`.trim();
  if (!raw) return undefined;
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  const d = Date.parse(r.Date_Sent);
  return Number.isNaN(d) ? undefined : new Date(d).toISOString();
}

export type MissionData = ReturnType<typeof useMissionData>;

export function useMissionData() {
  const wa = useWhatsAppFeed(30_000);
  const sms = useSmsFeed(30_000);
  const viber = useViberFeed(30_000);
  const web = useWebsiteFeed(30_000);
  const vapi = useVapiFeed(5_000);
  const emails = useEmailSheet();
  const activity = useActivity(10_000);

  const convs = useMemo(
    () =>
      ({
        whatsapp: wa.data?.items ?? [],
        sms: sms.data?.items ?? [],
        viber: viber.data?.items ?? [],
      }) as Record<ConvChannel, Conversation[]>,
    [wa.data, sms.data, viber.data],
  );
  const sessions = (web.data ?? []) as unknown as WebsiteSessionLike[];
  const calls = (vapi.data ?? []) as unknown as VapiCallLike[];
  const emailRows = emails.data ?? [];
  const liveCalls = calls.filter(isLiveCall);

  const offline: Record<PodKey, boolean> = {
    whatsapp: wa.isError,
    sms: sms.isError,
    viber: viber.isError || (viber.data ? !viber.data.connected : false),
    email: emails.isError,
    voice: vapi.isError,
    web: web.isError,
  };
  const loading = wa.isLoading || sms.isLoading;

  return {
    wa,
    sms,
    viber,
    web,
    vapi,
    emails,
    activity,
    convs,
    sessions,
    calls,
    emailRows,
    liveCalls,
    offline,
    loading,
  };
}

// ── derived stats ───────────────────────────────────────────────────────────
export type PodStatus = "Idle" | "Sending" | "Conversing" | "On call" | "Offline";

export interface PodStats {
  key: PodKey;
  status: PodStatus;
  sentToday: number;
  repliesToday: number;
  latest?: { kind: string; company?: string; ts: string };
}

const TWO_MIN = 2 * 60_000;

export function computePodStats(d: MissionData, events: AgentEvent[]): Record<PodKey, PodStats> {
  const out = {} as Record<PodKey, PodStats>;
  for (const key of POD_KEYS) {
    const evs = events.filter((e) => e.channel === key);
    let sentToday = 0;
    let repliesToday = 0;
    let lastMartin: string | undefined;
    let lastCustomer: string | undefined;

    if (key === "whatsapp" || key === "sms" || key === "viber") {
      for (const c of d.convs[key]) {
        for (const m of c.messages ?? []) {
          if (m.role === "customer") {
            if (isToday(m.ts)) repliesToday++;
            if (!lastCustomer || m.ts > lastCustomer) lastCustomer = m.ts;
          } else {
            if (isToday(m.ts)) sentToday++;
            if (!lastMartin || m.ts > lastMartin) lastMartin = m.ts;
          }
        }
      }
    } else if (key === "web") {
      for (const s of d.sessions) {
        for (const m of s.messages ?? []) {
          if (m.sender === "visitor") {
            if (isToday(m.timestamp)) repliesToday++;
            if (!lastCustomer || m.timestamp > lastCustomer) lastCustomer = m.timestamp;
          } else {
            if (isToday(m.timestamp)) sentToday++;
            if (!lastMartin || m.timestamp > lastMartin) lastMartin = m.timestamp;
          }
        }
      }
    } else if (key === "email") {
      for (const r of d.emailRows) {
        const ts = emailRowTs(r);
        if (isToday(ts)) sentToday++;
        if (ts && (!lastMartin || ts > lastMartin)) lastMartin = ts;
      }
    } else if (key === "voice") {
      for (const c of d.calls) {
        if (isToday(c.createdAt)) sentToday++;
        if (
          isToday(c.createdAt) &&
          c.endedAt &&
          c.startedAt &&
          Date.parse(c.endedAt) - Date.parse(c.startedAt) > 20_000
        )
          repliesToday++;
      }
    }

    let status: PodStatus = "Idle";
    if (d.offline[key]) status = "Offline";
    else if (key === "voice" && d.liveCalls.length) status = "On call";
    else if (ageMs(lastCustomer) < TWO_MIN) status = "Conversing";
    else if (ageMs(lastMartin) < TWO_MIN) status = "Sending";

    const top = evs[0];
    let latest = top ? { kind: top.kind, company: top.company, ts: top.ts } : undefined;
    if (!latest && key === "email" && d.emailRows.length) {
      const r = d.emailRows[d.emailRows.length - 1];
      latest = { kind: "opener_sent", company: r.Company_Name, ts: emailRowTs(r) ?? "" };
    }
    out[key] = { key, status, sentToday, repliesToday, latest };
  }
  return out;
}

export interface NeedsHumanItem {
  id: string;
  channel: ChannelKey;
  company: string;
  reason: string;
  since: string;
  href: string;
}

export function computeNeedsHuman(d: MissionData): NeedsHumanItem[] {
  const items: NeedsHumanItem[] = [];
  for (const ch of ["whatsapp", "sms", "viber"] as ConvChannel[]) {
    for (const c of d.convs[ch]) {
      if (!c.humanEscalated) continue;
      const lastCust = [...(c.messages ?? [])].reverse().find((m) => m.role === "customer")?.ts;
      items.push({
        id: `${ch}:${c.phone}`,
        channel: ch,
        company: c.companyName || c.leadName || c.phone,
        reason: "Escalated by Martin",
        since: lastCust || c.lastMessageAt || c.lastUpdated,
        href: channelHref(ch, { phone: c.phone }),
      });
    }
  }
  for (const s of d.sessions) {
    if (s.status !== "escalated") continue;
    items.push({
      id: `web:${s.sessionId}`,
      channel: "web",
      company: s.visitorName || s.businessType || `Visitor ${s.sessionId.slice(-6)}`,
      reason: "Website chat escalated",
      since: s.lastMessageAt ?? "",
      href: channelHref("web", { sessionId: s.sessionId }),
    });
  }
  const weekAgo = Date.now() - 7 * 86_400_000;
  for (const c of d.calls) {
    if (!isTransferredCall(c)) continue;
    const ts = c.endedAt || c.createdAt;
    if (Date.parse(ts) < weekAgo) continue;
    items.push({
      id: `voice:${c.id}`,
      channel: "voice",
      company: c.customer?.name || c.customer?.number || "Unknown caller",
      reason: "Call transferred",
      since: ts,
      href: channelHref("voice", { phone: c.customer?.number }),
    });
  }
  return items.filter((i) => i.since).sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

export interface FunnelStage {
  label: string;
  value: number;
}

export function computeFunnel(d: MissionData, ch: PodKey): FunnelStage[] {
  if (ch === "whatsapp" || ch === "sms" || ch === "viber") {
    const cs = d.convs[ch];
    return [
      { label: "Contacted", value: cs.length },
      { label: "Replied", value: cs.filter(hasReplied).length },
      { label: "Price / brochure", value: cs.filter((c) => c.priceSent || c.brochureSent).length },
      { label: "Meeting booked", value: cs.filter((c) => c.meetingScheduled).length },
    ];
  }
  if (ch === "web") {
    const ss = d.sessions;
    return [
      { label: "Sessions", value: ss.length },
      {
        label: "Engaged (2+ msgs)",
        value: ss.filter(
          (s) => (s.messages ?? []).filter((m) => m.sender === "visitor").length >= 2,
        ).length,
      },
      {
        label: "Price / brochure",
        value: ss.filter((s) => (s.messages ?? []).some((m) => m.attachmentType)).length,
      },
      { label: "Escalated", value: ss.filter((s) => s.status === "escalated").length },
    ];
  }
  if (ch === "voice") {
    const cs = d.calls;
    const connected = cs.filter(
      (c) => c.startedAt && c.endedAt && Date.parse(c.endedAt) - Date.parse(c.startedAt) > 20_000,
    );
    return [
      { label: "Calls placed", value: cs.length },
      { label: "Connected (>20s)", value: connected.length },
      { label: "Transferred", value: cs.filter(isTransferredCall).length },
    ];
  }
  return [{ label: "Emails sent", value: d.emailRows.length }];
}

export function median(nums: number[]) {
  if (!nums.length) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function fmtDurationShort(ms: number) {
  if (!Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

/** Remembers which event ids have been seen; returns the ids that are new in this batch (empty on first load). */
export function useNewEventIds(events: AgentEvent[] | undefined) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<AgentEvent[]>([]);
  useEffect(() => {
    if (!events) return;
    if (!seen.current) {
      seen.current = new Set(events.map((e) => e.id));
      return;
    }
    const added = events.filter((e) => !seen.current!.has(e.id));
    added.forEach((e) => seen.current!.add(e.id));
    if (added.length) setFresh(added);
  }, [events]);
  return fresh;
}

export const NO_EVENTS: AgentEvent[] = [];
