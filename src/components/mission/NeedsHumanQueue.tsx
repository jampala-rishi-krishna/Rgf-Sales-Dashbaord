import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "@tanstack/react-router";
import { ChannelBadge, EmptyState } from "@/components/shared";
import { computeNeedsHuman, fmtDurationShort, useNow, type MissionData } from "./data";

const FIFTEEN_MIN = 15 * 60_000;

export function NeedsHumanQueue({ data, wall }: { data: MissionData; wall?: boolean }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const now = useNow(30_000);
  const items = useMemo(() => computeNeedsHuman(data), [data]);

  return (
    <section
      aria-label="Needs human"
      className="flex h-full flex-col rounded-2xl border bg-[var(--surface,#fff)] p-4 shadow-sm"
      style={{ borderColor: "var(--border,#EDE6DC)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
          Needs human{" "}
          <span className="ml-1 rounded-full bg-[#86000B] px-1.5 text-[10px] text-white">
            {items.length}
          </span>
        </h2>
        <span className="text-[10px]" style={{ color: "var(--muted-foreground,#6B6F68)" }}>
          Longest wait first
        </span>
      </div>
      {!items.length ? (
        <EmptyState title="All clear" description="No conversations waiting on a human." />
      ) : (
        <ul className="max-h-[420px] space-y-1.5 overflow-auto">
          {items.map((it) => {
            const wait = now - Date.parse(it.since);
            const urgent = wait > FIFTEEN_MIN;
            return (
              <li
                key={it.id}
                className="relative flex items-center gap-2 rounded-lg border px-2 py-1.5"
                style={{ borderColor: urgent ? "rgba(134,0,11,.35)" : "var(--border,#EDE6DC)" }}
              >
                {urgent && !reduce && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-lg"
                    style={{ background: "#86000B" }}
                    animate={{ opacity: [0.02, 0.1, 0.02] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
                <ChannelBadge channel={it.channel} />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-xs font-semibold"
                    style={{ color: "var(--rgf-ink,#1B2419)" }}
                  >
                    {it.company}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted-foreground,#6B6F68)" }}>
                    {it.reason}
                  </div>
                </div>
                <span
                  className="font-mono text-[11px] tabular-nums"
                  style={{ color: urgent ? "#86000B" : "var(--muted-foreground,#6B6F68)" }}
                >
                  {fmtDurationShort(wait)}
                </span>
                {!wall && (
                  <button
                    type="button"
                    onClick={() => router.navigate({ href: it.href })}
                    className="relative rounded-md px-2 py-1 text-[11px] font-semibold text-white"
                    style={{ background: "var(--rgf-red,#86000B)" }}
                  >
                    Open
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
