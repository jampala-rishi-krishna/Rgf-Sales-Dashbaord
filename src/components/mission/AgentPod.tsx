import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "@tanstack/react-router";
import { AgentAvatar, ChannelGlyph, TypingDots } from "@/components/shared";
import { CHANNELS } from "@/lib/channels";
import { EVENT_LABEL, type EventKind, type VapiCallLike } from "@/lib/events";
import { mmss, useNow, type PodStats, type PodStatus } from "./data";

const STATUS_STYLE: Record<PodStatus, { bg: string; fg: string }> = {
  Idle: { bg: "rgba(107,111,104,.12)", fg: "var(--muted, #6B6F68)" },
  Sending: { bg: "rgba(34,109,180,.12)", fg: "#226DB4" },
  Conversing: { bg: "rgba(51,103,59,.14)", fg: "#33673B" },
  "On call": { bg: "rgba(249,115,22,.15)", fg: "#C2410C" },
  Offline: { bg: "rgba(134,0,11,.10)", fg: "#86000B" },
};

export function StatusChip({ status }: { status: PodStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {status}
    </span>
  );
}

export function Typewriter({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (reduce) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) clearInterval(t);
    }, 28);
    return () => clearInterval(t);
  }, [text, reduce]);
  return (
    <span className={className} title={text}>
      {text.slice(0, n)}
      {n < text.length && <span className="opacity-60">▍</span>}
    </span>
  );
}

function Waveform({ color }: { color: string }) {
  const reduce = useReducedMotion();
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-sm"
          style={{ background: color, height: 6 }}
          animate={reduce ? undefined : { height: [4, 12, 6, 10, 4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

export function tickerText(latest?: PodStats["latest"]) {
  if (!latest) return "Waiting for activity…";
  const t = `${EVENT_LABEL[latest.kind as EventKind] ?? latest.kind} · ${latest.company || "Unknown"}`;
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
}

export function AgentPod({
  stats,
  liveCall,
  compact,
}: {
  stats: PodStats;
  liveCall?: VapiCallLike;
  compact?: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const now = useNow(1000);
  const ch = CHANNELS[stats.key];
  const agent = stats.key === "voice" ? "Mara" : "Martin";
  const onCall = stats.status === "On call" && liveCall;
  const conversing = stats.status === "Conversing";
  const recentAgent = stats.latest && Date.now() - Date.parse(stats.latest.ts) < 8000;

  return (
    <motion.button
      type="button"
      onClick={() => router.navigate({ href: ch.route })}
      className="relative w-full rounded-xl border bg-[var(--surface,#fff)] px-3 py-2 text-left shadow-sm transition-colors hover:border-[color:var(--pod)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pod)]"
      style={{ ["--pod" as string]: ch.color, borderColor: "var(--border, #EDE6DC)" }}
      animate={
        conversing && !reduce
          ? {
              boxShadow: [
                `0 0 0 0 ${ch.color}00`,
                `0 0 0 6px ${ch.color}33`,
                `0 0 0 0 ${ch.color}00`,
              ],
            }
          : { boxShadow: "0 1px 2px rgba(27,36,25,.06)" }
      }
      transition={
        conversing ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }
      }
      aria-label={`${ch.label} — ${agent} — ${stats.status}`}
    >
      {onCall && !reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl border-2"
          style={{ borderColor: ch.color }}
          animate={{ opacity: [0.8, 0], scale: [1, 1.06] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}
      <div className="flex items-center gap-2">
        <span className="relative shrink-0">
          <AgentAvatar agent={agent} channel={stats.key} size={compact ? 28 : 32} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--rgf-ink, #1B2419)" }}
          >
            <ChannelGlyph channel={stats.key} size={13} />
            <span className="truncate">{ch.label}</span>
            <span className="font-normal opacity-60">· {agent}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <StatusChip status={stats.status} />
            {recentAgent && <TypingDots />}
          </div>
        </div>
        <div
          className="shrink-0 text-right font-mono text-[10px] leading-tight tabular-nums"
          style={{ color: "var(--muted, #6B6F68)" }}
        >
          <div>
            <b className="text-xs" style={{ color: "var(--rgf-ink, #1B2419)" }}>
              {stats.sentToday}
            </b>{" "}
            {stats.key === "voice" ? "calls" : "sent"}
          </div>
          <div>
            <b className="text-xs" style={{ color: ch.color }}>
              {stats.repliesToday}
            </b>{" "}
            {stats.key === "voice" ? "conn." : "replies"}
          </div>
        </div>
      </div>
      {onCall ? (
        <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "#C2410C" }}>
          <Waveform color={ch.color} />
          <span className="font-mono tabular-nums">
            {mmss(now - Date.parse(liveCall.startedAt || liveCall.createdAt))}
          </span>
          <span className="truncate">
            {liveCall.customer?.name || liveCall.customer?.number || "Unknown"}
          </span>
        </div>
      ) : (
        <div className="mt-1 truncate text-[11px]" style={{ color: "var(--muted, #6B6F68)" }}>
          <Typewriter text={tickerText(stats.latest)} />
        </div>
      )}
    </motion.button>
  );
}
