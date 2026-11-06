import { formatManila } from "@/lib/channels";
import {
  callLead,
  callOutcome,
  callTitle,
  durationSeconds,
  mmss,
  OUTCOME_STYLE,
  type Outcome,
  type VapiCall,
} from "./vapi";

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const s = OUTCOME_STYLE[outcome];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color: s.fg, backgroundColor: s.bg }}
    >
      {outcome === "Live" && (
        <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
      )}
      {outcome}
    </span>
  );
}

export function CallCard({
  call,
  selected,
  onSelect,
}: {
  call: VapiCall;
  selected: boolean;
  onSelect: () => void;
}) {
  const lead = callLead(call);
  const outcome = callOutcome(call);
  const title = callTitle(call);
  const subtitle = lead.companyName && lead.leadName ? lead.leadName : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 motion-reduce:transition-none ${
        selected
          ? "border-[var(--ch)]/60 bg-[var(--ch)]/10"
          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ch-text)]">
          {title}
        </div>
        <OutcomeChip outcome={outcome} />
      </div>
      {subtitle && <div className="truncate text-xs text-[var(--ch-text-2)]">{subtitle}</div>}
      <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--ch-text-2)]">
        <span className="truncate font-mono">{lead.phone ?? "—"}</span>
        <span className="ml-auto shrink-0 font-mono tabular-nums">
          {mmss(durationSeconds(call))}
        </span>
        {typeof call.cost === "number" && (
          <span className="shrink-0 font-mono tabular-nums">${call.cost.toFixed(2)}</span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-[var(--ch-text-2)]/80">
        {formatManila(call.createdAt)}
      </div>
    </button>
  );
}
