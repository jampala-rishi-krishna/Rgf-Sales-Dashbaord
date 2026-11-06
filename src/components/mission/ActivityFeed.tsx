import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "@tanstack/react-router";
import { ChannelDot, EmptyState } from "@/components/shared";
import { CHANNELS, formatManila, type ChannelKey } from "@/lib/channels";
import { EVENT_LABEL, type AgentEvent } from "@/lib/events";
import { eventHref, timeAgo, NO_EVENTS, type MissionData } from "./data";

const FILTERS: (ChannelKey | "all")[] = ["all", "whatsapp", "sms", "viber", "web", "voice"];

export function ActivityFeed({ data, newEvents }: { data: MissionData; newEvents: AgentEvent[] }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [filter, setFilter] = useState<ChannelKey | "all">("all");
  const all = data.activity.data?.events ?? NO_EVENTS;
  const rows = useMemo(
    () => (filter === "all" ? all : all.filter((e) => e.channel === filter)),
    [all, filter],
  );
  const newIds = useMemo(() => new Set(newEvents.map((e) => e.id)), [newEvents]);
  const parentRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
    getItemKey: (i) => rows[i].id,
  });

  return (
    <section
      aria-label="Live activity"
      className="flex h-full flex-col rounded-2xl border bg-[var(--surface,#fff)] p-4 shadow-sm"
      style={{ borderColor: "var(--border,#EDE6DC)" }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
          Live activity
        </h2>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
              style={
                filter === f
                  ? {
                      background: "var(--rgf-ink,#1B2419)",
                      color: "var(--surface,#fff)",
                      borderColor: "transparent",
                    }
                  : { borderColor: "var(--border,#EDE6DC)", color: "var(--muted,#6B6F68)" }
              }
            >
              {f !== "all" && <ChannelDot channel={f} />}
              {f === "all" ? "All" : CHANNELS[f].label}
            </button>
          ))}
        </div>
      </div>
      <div aria-live="polite" className="sr-only">
        {newEvents.length
          ? `${newEvents.length} new activity event${newEvents.length > 1 ? "s" : ""}`
          : ""}
      </div>
      {data.activity.isError && !all.length ? (
        <EmptyState title="Activity feed unavailable" description="Retrying automatically." />
      ) : data.activity.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-black/5" />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState title="No activity yet" description="Events appear here as agents work." />
      ) : (
        <div ref={parentRef} className="h-[420px] overflow-auto">
          <div className="relative w-full" style={{ height: v.getTotalSize() }}>
            {v.getVirtualItems().map((vi) => {
              const e = rows[vi.index];
              const color = CHANNELS[e.channel]?.color ?? "#888";
              const isNew = newIds.has(e.id) && !reduce;
              return (
                <motion.button
                  key={vi.key}
                  type="button"
                  onClick={() => router.navigate({ href: eventHref(e) })}
                  className="absolute left-0 top-0 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/[.03]"
                  style={{ transform: `translateY(${vi.start}px)`, height: vi.size }}
                  initial={isNew ? { opacity: 0, y: -8, backgroundColor: `${color}1F` } : false}
                  animate={isNew ? { opacity: 1, y: 0, backgroundColor: `${color}00` } : undefined}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                >
                  <span className="mt-1.5">
                    <ChannelDot channel={e.channel} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5 text-xs">
                      <b style={{ color: "var(--rgf-ink,#1B2419)" }}>{EVENT_LABEL[e.kind]}</b>
                      <span className="truncate" style={{ color: "var(--muted,#6B6F68)" }}>
                        {e.company || e.leadName || e.phone || ""}
                      </span>
                    </span>
                    {e.preview && (
                      <span
                        className="block truncate text-[11px]"
                        style={{ color: "var(--muted,#6B6F68)" }}
                      >
                        {e.preview}
                      </span>
                    )}
                  </span>
                  <time
                    className="shrink-0 font-mono text-[10px]"
                    dateTime={e.ts}
                    title={formatManila(e.ts)}
                    style={{ color: "var(--muted,#6B6F68)" }}
                  >
                    {timeAgo(e.ts)}
                  </time>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
