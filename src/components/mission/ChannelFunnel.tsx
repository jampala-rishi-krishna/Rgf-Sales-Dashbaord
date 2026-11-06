import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChannelGlyph } from "@/components/shared";
import { CHANNELS } from "@/lib/channels";
import { computeFunnel, POD_KEYS, type MissionData, type PodKey } from "./data";

export function ChannelFunnel({ data }: { data: MissionData }) {
  const [ch, setCh] = useState<PodKey>("whatsapp");
  const reduce = useReducedMotion();
  const stages = useMemo(() => computeFunnel(data, ch), [data, ch]);
  const top = Math.max(1, stages[0]?.value ?? 1);
  const color = CHANNELS[ch].color;

  return (
    <section
      aria-label="Funnel"
      className="h-full rounded-2xl border bg-[var(--surface,#fff)] p-4 shadow-sm"
      style={{ borderColor: "var(--border,#EDE6DC)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold" style={{ color: "var(--rgf-ink,#1B2419)" }}>
          Funnel
        </h2>
        <div role="tablist" className="flex flex-wrap gap-1">
          {POD_KEYS.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={ch === k}
              onClick={() => setCh(k)}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors"
              style={
                ch === k
                  ? { background: CHANNELS[k].color, borderColor: CHANNELS[k].color, color: "#fff" }
                  : { borderColor: "var(--border,#EDE6DC)", color: "var(--muted,#6B6F68)" }
              }
              title={CHANNELS[k].label}
            >
              <ChannelGlyph channel={k} size={11} />
              <span className="hidden sm:inline">{CHANNELS[k].label}</span>
            </button>
          ))}
        </div>
      </div>
      <ol className="space-y-2">
        {stages.map((s, i) => {
          const w = (s.value / top) * 100;
          const conv = i > 0 && stages[i - 1].value ? (s.value / stages[i - 1].value) * 100 : null;
          return (
            <li key={s.label}>
              <div className="mb-0.5 flex items-baseline justify-between text-xs">
                <span style={{ color: "var(--rgf-ink,#1B2419)" }}>{s.label}</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--muted,#6B6F68)" }}>
                  <b style={{ color: "var(--rgf-ink,#1B2419)" }}>{s.value.toLocaleString()}</b>
                  {conv != null && <span className="ml-1.5">{conv.toFixed(0)}%</span>}
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded-md" style={{ background: `${color}14` }}>
                <motion.div
                  className="h-full rounded-md"
                  style={{ background: color, opacity: 1 - i * 0.15 }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.max(w, s.value ? 2 : 0)}%` }}
                  transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {ch === "viber" && data.offline.viber && (
        <p className="mt-3 text-[11px]" style={{ color: "var(--muted,#6B6F68)" }}>
          Viber feed not connected yet.
        </p>
      )}
    </section>
  );
}
