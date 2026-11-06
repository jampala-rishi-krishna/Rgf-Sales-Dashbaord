import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { AnimatedNumber, ChannelGlyph } from "@/components/shared";
import { CHANNELS, formatManila, type ChannelKey } from "@/lib/channels";
import type { CampaignRun, RunStatus } from "@/hooks/use-campaign-runs";

const STEPS: RunStatus[] = ["queued", "running", "done"];

const STATUS_META: Record<RunStatus, { label: string; icon: typeof Clock; cls: string }> = {
  queued: { label: "Queued", icon: Clock, cls: "text-[var(--muted,#6B6F68)]" },
  running: { label: "Running", icon: Loader2, cls: "text-amber-600" },
  done: { label: "Done", icon: CheckCircle2, cls: "text-[var(--rgf-green,#33673B)]" },
  failed: { label: "Failed", icon: XCircle, cls: "text-[var(--rgf-red,#86000B)]" },
};

export function runChannelKey(c: CampaignRun["channel"]): ChannelKey {
  return c === "voice_batch" ? "voice" : c;
}

export function RunCard({ run }: { run: CampaignRun }) {
  const reduce = useReducedMotion();
  const ch = runChannelKey(run.channel);
  const meta = CHANNELS[ch];
  const sm = STATUS_META[run.status] ?? STATUS_META.queued;
  const Icon = sm.icon;
  const stepIdx = run.status === "failed" ? 2 : STEPS.indexOf(run.status);
  const pct =
    run.requested > 0
      ? Math.min(100, Math.round(((run.sent + run.skipped + run.failed) / run.requested) * 100))
      : 0;
  const progress = run.status === "done" ? 100 : pct;

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="list-none rounded-[14px] border border-[var(--border,#EDE6DC)] bg-[var(--surface,#fff)] p-4 shadow-[0_1px_2px_rgba(27,36,25,.06)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="grid size-8 place-items-center rounded-lg"
          style={{ background: `${meta.color}1A`, color: meta.color }}
        >
          <ChannelGlyph channel={ch} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--rgf-ink,#1B2419)]">
            {run.channel === "voice_batch" ? "Voice batch" : meta.label} · {run.requested} lead
            {run.requested === 1 ? "" : "s"}
          </p>
          <p className="truncate text-xs text-[var(--muted,#6B6F68)]">
            {formatManila(run.startedAt)}
            {run.triggeredBy ? ` · ${run.triggeredBy}` : ""}
          </p>
        </div>
        {run.dryRun && (
          <span className="rounded-full border border-dashed border-amber-500 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Dry run
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1 text-sm font-medium ${sm.cls}`}
          aria-live="polite"
        >
          <Icon
            className={`size-4 ${run.status === "running" && !reduce ? "animate-spin" : ""}`}
            aria-hidden
          />
          {sm.label}
        </span>
      </div>

      {/* queued → running → done stepper */}
      <ol className="mt-3 flex items-center gap-1.5" aria-label="Run progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-1.5">
            <motion.span
              className="h-1.5 flex-1 rounded-full"
              initial={false}
              animate={{
                backgroundColor:
                  i <= stepIdx ? (run.status === "failed" ? "#86000B" : meta.color) : "#E7E1D8",
                opacity: i === stepIdx && run.status === "running" && !reduce ? [1, 0.5, 1] : 1,
              }}
              transition={
                i === stepIdx && run.status === "running" && !reduce
                  ? {
                      opacity: { repeat: Infinity, duration: 1.4 },
                      backgroundColor: { duration: 0.3 },
                    }
                  : { duration: reduce ? 0 : 0.3 }
              }
            />
            <span className="sr-only">
              {s}
              {i <= stepIdx ? " (reached)" : ""}
            </span>
          </li>
        ))}
      </ol>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Sent", run.sent, "text-[var(--rgf-green,#33673B)]"],
            ["Skipped", run.skipped, "text-[var(--muted,#6B6F68)]"],
            ["Failed", run.failed, "text-[var(--rgf-red,#86000B)]"],
          ] as const
        ).map(([label, v, cls]) => (
          <div key={label} className="rounded-lg bg-[var(--rgf-cream,#FFF8F0)] py-1.5">
            <dt className="text-[11px] uppercase tracking-wide text-[var(--muted,#6B6F68)]">
              {label}
            </dt>
            <dd className={`text-lg font-semibold tabular-nums ${cls}`}>
              <AnimatedNumber value={v} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted,#6B6F68)]">
        <span>
          {progress}% of requested
          {run.estimated && !run.dryRun ? " · estimated from feed" : ""}
          {run.channel === "email" && run.estimated && !run.dryRun
            ? " (no email feed — completes after 30 min)"
            : ""}
        </span>
        {!run.dryRun && (run.replied !== undefined ? run.replied > 0 : run.sent > 0) && (
          <Link
            to={meta.route as string}
            className="font-medium underline-offset-2 hover:underline"
            style={{ color: meta.color }}
          >
            {run.replied !== undefined
              ? `View ${run.replied} ${run.replied === 1 ? "reply" : "replies"} from this run`
              : `View ${run.sent} sent`}
          </Link>
        )}
      </div>
    </motion.li>
  );
}
