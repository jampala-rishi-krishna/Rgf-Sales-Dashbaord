import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PhoneCall } from "lucide-react";
import { usePolling, getJson } from "@/hooks/use-polling";
import { callLead, callTitle, isLive, mmss, toCallArray, type VapiCall } from "./vapi";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function WaveBars({ bars = 5, className = "" }: { bars?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`flex h-5 items-end gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-current"
          style={{ height: "40%" }}
          animate={reduce ? undefined : { height: ["30%", "100%", "45%", "80%", "30%"] }}
          transition={
            reduce
              ? undefined
              : { duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }
          }
        />
      ))}
    </div>
  );
}

/** Polls the 10 newest Vapi calls every 5s (paused when tab hidden) and shows any queued/ringing/in-progress call. */
export function LiveCallBanner({ onOpen }: { onOpen?: (id: string) => void }) {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const { data } = usePolling(
    ["vapi-live"],
    async () => toCallArray(await getJson<unknown>("/api/vapi-calls?limit=10")),
    5_000,
  );
  const live = (data ?? []).filter(isLive);
  const now = useNow(live.length > 0);

  // When a live call ends, refresh the first page of the history list so it shows its outcome.
  const prevLive = useRef<string>("");
  const liveKey = live
    .map((c) => c.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (prevLive.current && prevLive.current !== liveKey)
      void qc.invalidateQueries({ queryKey: ["vapi-calls", null] });
    prevLive.current = liveKey;
  }, [liveKey, qc]);

  return (
    <AnimatePresence initial={false}>
      {live.length > 0 && (
        <motion.div
          key="live"
          initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          className="shrink-0 overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div className="space-y-2 border-b border-white/5 bg-gradient-to-r from-orange-500/15 via-orange-500/5 to-transparent px-4 py-3">
            {live.map((c) => (
              <LiveRow key={c.id} call={c} now={now} onOpen={onOpen} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LiveRow({
  call,
  now,
  onOpen,
}: {
  call: VapiCall;
  now: number;
  onOpen?: (id: string) => void;
}) {
  const status = (call.status ?? "").toLowerCase();
  const started = call.startedAt ? new Date(call.startedAt).getTime() : null;
  const elapsed = status === "in-progress" && started ? (now - started) / 1000 : null;
  const lead = callLead(call);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(call.id)}
      className="flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
    >
      <span className="relative grid size-10 shrink-0 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--ch-accept)]/40 motion-reduce:animate-none" />
        <span className="absolute inset-0 rounded-full ring-2 ring-[var(--ch-accept)]" />
        <span className="relative grid size-8 place-items-center rounded-full bg-[var(--ch-accept)] text-white">
          <PhoneCall className="size-4" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ch-accept)]">
          Mara ·{" "}
          {status === "in-progress" ? "On call" : status === "ringing" ? "Ringing" : "Queued"}
        </div>
        <div className="truncate text-sm font-semibold text-[var(--ch-text)]">
          {callTitle(call)}
        </div>
        {lead.phone && (
          <div className="truncate font-mono text-xs text-[var(--ch-text-2)]">{lead.phone}</div>
        )}
      </div>
      <WaveBars className="text-[var(--ch)]" />
      <div className="w-14 shrink-0 text-right font-mono text-lg tabular-nums text-[var(--ch-text)]">
        {elapsed != null ? mmss(elapsed) : "--:--"}
      </div>
    </button>
  );
}
