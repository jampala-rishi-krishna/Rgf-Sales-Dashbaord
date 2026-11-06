import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { AgentAvatar, AnimatedNumber, ChannelGlyph, LiveDot } from "@/components/shared";
import { usePreLeads } from "@/hooks/use-pre-leads";
import { CHANNELS, hasReplied } from "@/lib/channels";
import type { AgentEvent } from "@/lib/events";
import { AgentPod } from "./AgentPod";
import {
  computePodStats,
  isToday,
  manilaDate,
  NO_EVENTS,
  POD_KEYS,
  useNow,
  type MissionData,
  type PodKey,
} from "./data";

// ── geometry (viewBox units) ────────────────────────────────────────────────
const W = 1200;
const H = 600;
const SCOUT = { x: 105, y: 300 };
const CRM = { x: 360, y: 300 };
const POD_X = 700;
const POD_Y = (i: number) => 58 + i * 97;
const OUT_X = 1085;
const OUTCOMES = [
  { key: "replied", label: "Replied", color: "#33673B" },
  { key: "price", label: "Price / brochure sent", color: "#226DB4" },
  { key: "meeting", label: "Meeting booked", color: "#7360F2" },
  { key: "escalated", label: "Escalated", color: "#86000B" },
] as const;
type OutcomeKey = (typeof OUTCOMES)[number]["key"];
const OUT_Y = (i: number) => 120 + i * 120;

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};
const PATH_SCOUT_CRM = curve(SCOUT.x + 85, SCOUT.y, CRM.x - 80, CRM.y);
const PATH_CRM_POD = (i: number) => curve(CRM.x + 80, CRM.y, POD_X - 135, POD_Y(i));
const PATH_POD_OUT = (i: number, j: number) => curve(POD_X + 135, POD_Y(i), OUT_X - 85, OUT_Y(j));

const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

type Dot = { id: string; d: string; color: string; reverse?: boolean };
const MAX_DOTS = 30;

function routeFor(e: AgentEvent): { d: string; reverse?: boolean } | null {
  if (e.kind === "lead_created") return { d: PATH_SCOUT_CRM };
  const i = POD_KEYS.indexOf(e.channel as PodKey);
  if (i < 0) return null;
  switch (e.kind) {
    case "opener_sent":
    case "reply_out":
    case "human_reply":
    case "call_started":
      return { d: PATH_CRM_POD(i) };
    case "reply_in":
      return { d: PATH_POD_OUT(i, 0) };
    case "price_sent":
    case "brochure_sent":
    case "form_sent":
      return { d: PATH_POD_OUT(i, 1) };
    case "meeting_booked":
      return { d: PATH_POD_OUT(i, 2) };
    case "escalated":
    case "call_transferred":
      return { d: PATH_POD_OUT(i, 3) };
    default:
      return null;
  }
}

function TravelDot({ dot, onDone }: { dot: Dot; onDone: (id: string) => void }) {
  const ref = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => {
    try {
      ref.current?.beginElement();
    } catch {
      /* SMIL unsupported */
    }
    const t = setTimeout(() => onDone(dot.id), 1300);
    return () => clearTimeout(t);
  }, [dot.id, onDone]);
  return (
    <g>
      <g>
        <circle r={9} fill={dot.color} opacity={0.25} filter="url(#mc-glow)" />
        <circle r={4.5} fill={dot.color} filter="url(#mc-glow)" />
        <animateMotion
          ref={ref}
          dur="1.1s"
          begin="indefinite"
          fill="freeze"
          path={dot.d}
          {...(dot.reverse ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})}
        />
      </g>
    </g>
  );
}

/** Next Scout run: Fridays 9:00 AM Manila; runs Fri (from 9am)–Sun. */
export function scoutSchedule(now: number) {
  const m = manilaDate(now);
  const dow = m.getUTCDay();
  const hour = m.getUTCHours();
  const running = (dow === 5 && hour >= 9) || dow === 6 || dow === 0;
  let days = (5 - dow + 7) % 7;
  if (days === 0 && hour >= 9) days = 7;
  const target =
    Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() + days, 9) - 8 * 3600_000;
  const ms = target - now;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3600_000);
  const min = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { running, countdown: d > 0 ? `${d}d ${h}h ${min}m` : `${h}h ${min}m ${s}s` };
}

function ScoutNode({ compact }: { compact?: boolean }) {
  const now = useNow(1000);
  const { running, countdown } = scoutSchedule(now);
  return (
    <div
      className="w-full rounded-xl border bg-[var(--surface,#fff)] p-3 shadow-sm"
      style={{ borderColor: "var(--border,#EDE6DC)" }}
    >
      <div className="flex items-center gap-2">
        <AgentAvatar agent="Scout" channel="scout" size={compact ? 28 : 32} />
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
            Scout
          </div>
          <div className="text-[10px]" style={{ color: CHANNELS.scout.color }}>
            {running ? "● Running · weekend sweep" : "Lead scraper"}
          </div>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-[10px]" style={{ color: "var(--muted,#6B6F68)" }}>
        <li>Google Maps · Apify</li>
        <li>FireCrawl</li>
        <li>Facebook · LinkedIn</li>
      </ul>
      {!running && (
        <div
          className="mt-2 rounded-md px-2 py-1 text-[10px]"
          style={{ background: "rgba(14,165,164,.1)", color: "#0B7F7E" }}
        >
          Next run Fri 9:00 AM
          <div className="font-mono tabular-nums">{countdown}</div>
        </div>
      )}
    </div>
  );
}

function CrmNode() {
  const q = usePreLeads();
  const leads = q.data?.leads ?? [];
  const today = leads.filter((l) => isToday(l.createdTime)).length;
  const connected = q.data?.connected !== false;
  return (
    <div
      className="w-full rounded-xl border bg-[var(--surface,#fff)] p-3 text-center shadow-sm"
      style={{ borderColor: "var(--border,#EDE6DC)" }}
    >
      <div
        className="flex items-center justify-center gap-1.5 text-xs font-semibold"
        style={{ color: CHANNELS.crm.color }}
      >
        <ChannelGlyph channel="crm" size={14} /> Zoho CRM
      </div>
      <div
        className="mt-1 text-2xl font-black tabular-nums"
        style={{ color: "var(--rgf-ink,#1B2419)" }}
      >
        {q.isLoading ? "…" : connected ? <AnimatedNumber value={leads.length} /> : "—"}
      </div>
      <div className="text-[10px]" style={{ color: "var(--muted,#6B6F68)" }}>
        Pre-Leads
      </div>
      {connected ? (
        <div className="mt-1 text-[11px] font-semibold" style={{ color: "#33673B" }}>
          +{today} today
        </div>
      ) : (
        <div className="mt-1 text-[10px]" style={{ color: "var(--muted,#6B6F68)" }}>
          CRM not connected
        </div>
      )}
    </div>
  );
}

function OutcomeNode({ label, color, value }: { label: string; color: string; value: number }) {
  return (
    <div
      className="w-full rounded-xl border bg-[var(--surface,#fff)] px-3 py-2 shadow-sm"
      style={{ borderColor: "var(--border,#EDE6DC)", borderLeft: `3px solid ${color}` }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted,#6B6F68)" }}
      >
        {label}
      </div>
      <div className="text-lg font-black tabular-nums" style={{ color }}>
        <AnimatedNumber value={value} />
      </div>
    </div>
  );
}

export function LiveOpsCanvas({ data, newEvents }: { data: MissionData; newEvents: AgentEvent[] }) {
  const reduce = useReducedMotion();
  const events = data.activity.data?.events ?? NO_EVENTS;
  const pods = useMemo(() => computePodStats(data, events), [data, events]);
  const liveCall = data.liveCalls[0];
  const [dots, setDots] = useState<Dot[]>([]);

  // new CRM leads → Scout→CRM dots
  const preLeads = usePreLeads();
  const prevLeadCount = useRef<number | null>(null);
  useEffect(() => {
    const n = preLeads.data?.leads?.length;
    if (n == null) return;
    const prev = prevLeadCount.current;
    prevLeadCount.current = n;
    if (prev == null || n <= prev || reduce) return;
    const add = Math.min(n - prev, 5);
    setDots((ds) =>
      [
        ...ds,
        ...Array.from({ length: add }, (_, i) => ({
          id: `lead-${n}-${i}-${Date.now()}`,
          d: PATH_SCOUT_CRM,
          color: CHANNELS.scout.color,
        })),
      ].slice(-MAX_DOTS),
    );
  }, [preLeads.data, reduce]);

  useEffect(() => {
    if (reduce || !newEvents.length) return;
    const add: Dot[] = [];
    for (const e of newEvents.slice(0, MAX_DOTS)) {
      const r = routeFor(e);
      if (r)
        add.push({
          id: `${e.id}-${Date.now()}`,
          d: r.d,
          reverse: r.reverse,
          color: CHANNELS[e.channel]?.color ?? "#888",
        });
    }
    if (add.length) setDots((ds) => [...ds, ...add].slice(-MAX_DOTS));
  }, [newEvents, reduce]);

  const removeDot = useMemo(
    () => (id: string) => setDots((ds) => ds.filter((d) => d.id !== id)),
    [],
  );

  const outcomeValues = useMemo(() => {
    const all = [...data.convs.whatsapp, ...data.convs.sms, ...data.convs.viber];
    const v: Record<OutcomeKey, number> = {
      replied:
        all.filter(hasReplied).length +
        data.sessions.filter((s) => (s.messages ?? []).some((m) => m.sender === "visitor")).length,
      price:
        all.filter((c) => c.priceSent || c.brochureSent).length +
        data.sessions.filter((s) => (s.messages ?? []).some((m) => m.attachmentType)).length,
      meeting: all.filter((c) => c.meetingScheduled).length,
      escalated:
        all.filter((c) => c.humanEscalated).length +
        data.sessions.filter((s) => s.status === "escalated").length,
    };
    return v;
  }, [data.convs, data.sessions]);

  const fresh = (data.activity.dataUpdatedAt ?? 0) > Date.now() - 30_000;

  return (
    <section
      aria-label="Live operations"
      className="rounded-2xl border bg-[var(--rgf-cream,#FFF8F0)] p-4"
      style={{ borderColor: "var(--border,#EDE6DC)" }}
    >
      <header className="mb-2 flex items-center justify-between">
        <h2
          className="flex items-center gap-2 text-sm font-bold"
          style={{ color: "var(--rgf-ink,#1B2419)" }}
        >
          <LiveDot fresh={fresh} /> Live Ops
        </h2>
        <span className="text-[11px]" style={{ color: "var(--muted,#6B6F68)" }}>
          Scout → CRM → Agents → Outcomes
        </span>
      </header>

      {/* Desktop canvas */}
      <div className="relative hidden w-full lg:block" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <filter id="mc-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={PATH_SCOUT_CRM}
            fill="none"
            stroke={CHANNELS.scout.color}
            strokeOpacity={0.35}
            strokeWidth={2}
            strokeDasharray="4 6"
          />
          {POD_KEYS.map((k, i) => (
            <path
              key={k}
              d={PATH_CRM_POD(i)}
              fill="none"
              stroke={CHANNELS[k].color}
              strokeOpacity={0.3}
              strokeWidth={2}
            />
          ))}
          {POD_KEYS.map((k, i) =>
            OUTCOMES.map((o, j) => (
              <path
                key={`${k}-${o.key}`}
                d={PATH_POD_OUT(i, j)}
                fill="none"
                stroke={CHANNELS[k].color}
                strokeOpacity={0.08}
                strokeWidth={1.5}
              />
            )),
          )}
          {dots.map((d) => (
            <TravelDot key={d.id} dot={d} onDone={removeDot} />
          ))}
        </svg>

        <div
          className="absolute w-[15%] -translate-x-1/2 -translate-y-1/2"
          style={pct(SCOUT.x, SCOUT.y)}
        >
          <ScoutNode />
        </div>
        <div
          className="absolute w-[13%] -translate-x-1/2 -translate-y-1/2"
          style={pct(CRM.x, CRM.y)}
        >
          <CrmNode />
        </div>
        {POD_KEYS.map((k, i) => (
          <div
            key={k}
            className="absolute w-[22.5%] -translate-x-1/2 -translate-y-1/2"
            style={pct(POD_X, POD_Y(i))}
          >
            <AgentPod stats={pods[k]} liveCall={k === "voice" ? liveCall : undefined} compact />
          </div>
        ))}
        {OUTCOMES.map((o, j) => (
          <div
            key={o.key}
            className="absolute w-[14%] -translate-x-1/2 -translate-y-1/2"
            style={pct(OUT_X, OUT_Y(j))}
          >
            <OutcomeNode label={o.label} color={o.color} value={outcomeValues[o.key]} />
          </div>
        ))}
      </div>

      {/* Mobile / tablet: vertical stack */}
      <div className="space-y-3 lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          <ScoutNode compact />
          <CrmNode />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {POD_KEYS.map((k) => (
            <AgentPod
              key={k}
              stats={pods[k]}
              liveCall={k === "voice" ? liveCall : undefined}
              compact
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <OutcomeNode key={o.key} label={o.label} color={o.color} value={outcomeValues[o.key]} />
          ))}
        </div>
      </div>
    </section>
  );
}
