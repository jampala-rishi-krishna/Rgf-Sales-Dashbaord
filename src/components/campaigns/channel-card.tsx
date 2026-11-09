import { useState } from "react";
import { AlertTriangle, Info, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChannelGlyph, ConfirmSendDialog, DisabledReason } from "@/components/shared";
import { CHANNELS } from "@/lib/channels";
import type { PreLead } from "@/lib/crm";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  VOICE_BATCH_SIZE,
  type CampaignDef,
  type SortOrder,
} from "./campaign-config";

export interface ChannelCardProps {
  def: CampaignDef;
  /** Eligible leads sorted oldest-first; null when CRM not connected. */
  eligible: PreLead[] | null;
  isAdmin: boolean;
  dryRun: boolean;
  busy: boolean;
  onLaunch: (args: { limit: number; sortOrder?: SortOrder }) => Promise<void>;
}

function parseLimit(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) return null;
  return n;
}

export function ChannelCard({ def, eligible, isAdmin, dryRun, busy, onLaunch }: ChannelCardProps) {
  const meta = CHANNELS[def.channel];
  const [raw, setRaw] = useState(String(DEFAULT_LIMIT));
  const [sort, setSort] = useState<SortOrder>("asc");
  const [open, setOpen] = useState(false);

  const limit = def.hasCount ? parseLimit(raw) : VOICE_BATCH_SIZE;
  const blankOrZero = def.hasCount && (!raw.trim() || Number(raw) === 0);
  const outOfRange = def.hasCount && !blankOrZero && limit === null;

  // Voice batch always targets the newest leads (n8n picks them).
  const effectiveSort: SortOrder = def.key === "voice_batch" ? "desc" : def.hasSort ? sort : "asc";
  const ordered = eligible ? (effectiveSort === "desc" ? [...eligible].reverse() : eligible) : null;
  const sample = (ordered ?? [])
    .slice(0, Math.min(5, limit ?? 5))
    .map((l) => l.company || "Unnamed company");
  const willSend = limit != null && eligible ? Math.min(limit, eligible.length) : (limit ?? 0);

  const canLaunch = isAdmin && !busy && limit != null && (eligible == null || eligible.length > 0);
  const reason = !isAdmin
    ? "Admin only"
    : limit == null
      ? blankOrZero
        ? "Enter a number of leads (0/blank is blocked)"
        : `Enter a whole number between 1 and ${MAX_LIMIT}`
      : eligible && eligible.length === 0
        ? "No eligible leads"
        : undefined;

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-[14px] border border-[var(--border,#EDE6DC)] bg-[var(--surface,#fff)] shadow-[0_1px_2px_rgba(27,36,25,.06),0_8px_24px_rgba(27,36,25,.06)]"
      aria-labelledby={`camp-${def.key}`}
    >
      <div className="h-1 w-full" style={{ background: meta.color }} />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <header className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={{ background: `${meta.color}1A`, color: meta.color }}
          >
            <ChannelGlyph channel={def.channel} size={20} />
          </span>
          <div className="min-w-0">
            <h3
              id={`camp-${def.key}`}
              className="font-semibold leading-tight text-[var(--rgf-ink,#1B2419)]"
            >
              {def.title}
            </h3>
            <p className="text-sm text-[var(--muted-foreground,#6B6F68)]">{def.agentLine}</p>
          </div>
        </header>

        <div className="flex items-baseline justify-between rounded-lg bg-[var(--rgf-cream,#FFF8F0)] px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground,#6B6F68)]">
            Eligible now
          </span>
          <span
            className="text-xl font-semibold tabular-nums"
            style={{ color: meta.color }}
            title={eligible == null ? "CRM not connected" : undefined}
          >
            {eligible == null ? "—" : eligible.length.toLocaleString()}
          </span>
        </div>

        {def.hasCount ? (
          <div className="space-y-1.5">
            <Label htmlFor={`limit-${def.key}`}>How many leads</Label>
            <Input
              id={`limit-${def.key}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_LIMIT}
              step={1}
              value={raw}
              disabled={!isAdmin}
              readOnly={!isAdmin}
              aria-invalid={blankOrZero || outOfRange}
              onChange={(e) => setRaw(e.target.value)}
            />
            {blankOrZero && (
              <p className="text-xs text-destructive">
                0 or blank is blocked. Enter 1–{MAX_LIMIT}.
              </p>
            )}
            {outOfRange && (
              <p className="text-xs text-destructive">
                Must be a whole number from 1 to {MAX_LIMIT}.
              </p>
            )}
          </div>
        ) : (
          <p
            className="rounded-lg border border-dashed px-3 py-2 text-sm font-medium"
            style={{ borderColor: meta.color, color: meta.color }}
          >
            Calls the 3 newest Pre-Leads
          </p>
        )}

        {def.hasSort && (
          <div className="space-y-1.5">
            <Label>Sort order</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={sort}
              disabled={!isAdmin}
              onValueChange={(v) => v && setSort(v as SortOrder)}
              className="justify-start"
            >
              <ToggleGroupItem value="asc">Oldest first</ToggleGroupItem>
              <ToggleGroupItem value="desc">Newest first</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {def.warning && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {def.warning}
          </p>
        )}
        {def.note && (
          <p className="flex items-start gap-2 text-xs text-[var(--muted-foreground,#6B6F68)]">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {def.note}
            {dryRun ? " — launchable in dry run." : "."}
          </p>
        )}

        <div className="mt-auto pt-1">
          <DisabledReason disabled={!canLaunch} reason={reason}>
            <Button
              className="w-full text-white"
              style={{ background: meta.color }}
              disabled={!canLaunch}
              onClick={() => setOpen(true)}
            >
              <Rocket className="size-4" aria-hidden />
              {busy ? "Launching…" : dryRun ? "Launch (dry run)" : "Launch"}
            </Button>
          </DisabledReason>
        </div>
      </div>

      <ConfirmSendDialog
        open={open}
        onOpenChange={setOpen}
        channelLabel={def.key === "voice_batch" ? "Voice batch (Mara)" : meta.label}
        count={willSend}
        sampleCompanies={sample}
        requireTypedCount
        onConfirm={async () => {
          if (limit == null || limit < 1) return; // hard block 0/blank
          setOpen(false);
          await onLaunch({ limit, sortOrder: def.hasSort ? sort : undefined });
        }}
      />
    </article>
  );
}
