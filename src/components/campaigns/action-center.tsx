import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { FlaskConical, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { canAct, useMe } from "@/hooks/use-me";
import { usePreLeads } from "@/hooks/use-pre-leads";
import { lookupOutreach, useOutreachIndex, type OutreachIndex } from "@/hooks/use-outreach-index";
import { useCampaignRuns, type CampaignChannel } from "@/hooks/use-campaign-runs";
import { useConversions } from "@/hooks/use-conversions";
import { postAction } from "@/lib/action-client";
import type { PreLead } from "@/lib/crm";
import { CAMPAIGNS, VOICE_BATCH_SIZE, type CampaignDef, type SortOrder } from "./campaign-config";
import { ChannelCard } from "./channel-card";
import { RunCard } from "./run-card";

function eligibleFor(
  def: CampaignDef,
  leads: PreLead[],
  index: OutreachIndex | undefined,
  isConverted: (l: PreLead) => boolean = () => false,
): PreLead[] {
  const out = leads.filter((l) => {
    if (def.needs === "email" ? !l.email : !l.phone) return false;
    // Already a Zoho Lead: never send another bulk opener.
    if (isConverted(l)) return false;
    if (!index) return true;
    return !lookupOutreach(index, l)[def.outreachKey]?.contacted;
  });
  // Oldest first; cards reverse for "desc" (Newest first).
  out.sort((a, b) => Date.parse(a.createdTime) - Date.parse(b.createdTime));
  return def.key === "voice_batch" ? out.slice(-VOICE_BATCH_SIZE) : out;
}

export function ActionCenter() {
  const meQuery = useMe();
  const me = meQuery.data;
  const isAdmin = canAct(me?.user?.role, "admin");
  const dryRun = me?.dryRun ?? true;
  const preLeads = usePreLeads();
  const { index, isLoading: outreachLoading } = useOutreachIndex();
  const { runs, addRun, clearFinished } = useCampaignRuns();
  const { find: findConversion } = useConversions();
  const [busy, setBusy] = useState<CampaignChannel | null>(null);

  const connected = !!preLeads.data?.connected;
  const leads = preLeads.data?.leads;

  const isConverted = useMemo(
    () => (l: PreLead) => !!findConversion({ id: l.id, phone: l.phone, email: l.email }),
    [findConversion],
  );
  const eligibleByChannel = useMemo(() => {
    const m = new Map<CampaignChannel, PreLead[] | null>();
    for (const def of CAMPAIGNS)
      m.set(
        def.key,
        connected && leads && !outreachLoading ? eligibleFor(def, leads, index, isConverted) : null,
      );
    return m;
  }, [connected, leads, index, outreachLoading, isConverted]);
  // How many would have been eligible but are already converted (per channel).
  const convertedByChannel = useMemo(() => {
    const m = new Map<CampaignChannel, number>();
    if (!connected || !leads || outreachLoading) return m;
    for (const def of CAMPAIGNS)
      m.set(
        def.key,
        eligibleFor(def, leads, index).length - (eligibleByChannel.get(def.key)?.length ?? 0),
      );
    return m;
  }, [connected, leads, index, outreachLoading, eligibleByChannel]);

  async function launch(def: CampaignDef, limit: number, sortOrder?: SortOrder) {
    if (!Number.isInteger(limit) || limit < 1) return; // never send 0/blank
    setBusy(def.key);
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    try {
      const res = await postAction(
        "/api/actions/bulk",
        { channel: def.key, limit, sortOrder, runId },
        def.key === "voice_batch" ? "Voice batch started" : `${def.title} started`,
      );
      if (res.ok) {
        addRun({
          runId,
          channel: def.key,
          requested: limit,
          startedAt,
          triggeredBy: me?.user?.name ?? me?.user?.email,
          dryRun: !!res.dryRun || dryRun,
        });
      }
    } finally {
      setBusy(null);
    }
  }

  const hasFinished = runs.some((r) => r.status === "done" || r.status === "failed");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--rgf-ink,#1B2419)]">
            Campaigns
          </h1>
          <p className="text-sm text-[var(--muted-foreground,#6B6F68)]">
            Launch bulk outreach — the dashboard version of the Cliq slash commands.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dryRun && (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-500 px-2.5 py-1 font-semibold text-amber-700">
              <FlaskConical className="size-3.5" aria-hidden /> Dry run — nothing is sent
            </span>
          )}
          {!connected && !preLeads.isLoading && (
            <span className="rounded-full bg-[var(--rgf-beige,#FFEBCE)] px-2.5 py-1 text-[var(--rgf-ink,#1B2419)]">
              CRM not connected — eligible counts unavailable
            </span>
          )}
          {!isAdmin && me?.user && (
            <span className="rounded-full bg-muted px-2.5 py-1">
              Read-only: launching is admin only
            </span>
          )}
        </div>
      </header>

      <section aria-label="Launch a campaign" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CAMPAIGNS.map((def) => (
          <ChannelCard
            key={def.key}
            def={def}
            eligible={eligibleByChannel.get(def.key) ?? null}
            convertedExcluded={convertedByChannel.get(def.key) ?? 0}
            isAdmin={isAdmin}
            dryRun={dryRun}
            busy={busy === def.key}
            onLaunch={({ limit, sortOrder }) => launch(def, limit, sortOrder)}
          />
        ))}
      </section>

      <section aria-labelledby="runs-h" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="runs-h" className="text-lg font-semibold text-[var(--rgf-ink,#1B2419)]">
            Runs
          </h2>
          {hasFinished && (
            <Button variant="ghost" size="sm" onClick={clearFinished}>
              Clear finished
            </Button>
          )}
        </div>
        {runs.length === 0 ? (
          <EmptyState
            title="No campaign runs yet"
            description="Launched campaigns appear here with live sent / skipped / failed counters."
            icon={<ListChecks className="size-6" />}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {runs.map((r) => (
                <RunCard key={r.runId} run={r} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}
