// "Ready to convert": Pre-Leads with a real two-way interaction that aren't Leads yet,
// with sequential bulk conversion (max 20, same defaults, duplicates skipped).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { DisabledReason, EmptyState } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { ConvertLeadButton } from "@/components/convert/ConvertLeadButton";
import { useLeadOwners } from "@/components/convert/use-lead-owners";
import { canAct, useMe } from "@/hooks/use-me";
import { usePreLeads } from "@/hooks/use-pre-leads";
import { useConversions } from "@/hooks/use-conversions";
import {
  CONVERT_CHANNELS,
  buildLeadTimeline,
  emailAddress,
  emailKey,
  getConversionEligibility,
  phoneKey,
  type ConversionEligibility,
  type ConversionFeeds,
  type ConvertChannel,
} from "@/lib/conversion";
import { buildConvertRequest, type ConvertSubject } from "@/lib/convert-defaults";
import { convertLead } from "@/lib/convert-client";
import { leadContactName, type PreLead } from "@/lib/crm";
import { ChannelChip, When } from "./format";

export const MAX_BULK = 20;

export interface ReadyRow {
  preLead: PreLead;
  subject: ConvertSubject;
  elig: ConversionEligibility;
  converted: boolean;
}

/** Eligibility for every Pre-Lead that appears in any feed (pre-filtered by key for speed). */
export function useReadyToConvert(feeds: ConversionFeeds) {
  const pre = usePreLeads();
  const { find } = useConversions();
  const all = useMemo<ReadyRow[]>(() => {
    const keys = new Set<string>();
    for (const ch of ["whatsapp", "sms", "viber"] as const)
      for (const c of feeds[ch] ?? []) {
        keys.add(phoneKey(c.phone));
        keys.add(emailKey(c.leadEmail));
        if (c.leadId) keys.add(`id:${c.leadId}`);
      }
    for (const c of feeds.calls ?? []) keys.add(phoneKey(c.customer?.number));
    for (const s of feeds.web ?? []) {
      keys.add(phoneKey(s.visitorPhone));
      keys.add(emailKey(s.visitorEmail));
    }
    for (const t of feeds.email ?? []) keys.add(emailAddress(t.from));
    keys.delete("");
    const out: ReadyRow[] = [];
    for (const l of pre.data?.leads ?? []) {
      if (!keys.has(phoneKey(l.phone)) && !keys.has(emailKey(l.email)) && !keys.has(`id:${l.id}`))
        continue;
      const identity = { id: l.id, phone: l.phone, email: l.email, companyName: l.company };
      const elig = getConversionEligibility(identity, feeds);
      if (!elig.eligible) continue;
      out.push({
        preLead: l,
        elig,
        converted: !!find(identity),
        subject: {
          preLeadId: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          company: l.company,
          phone: l.phone,
          email: l.email,
          product: l.products.join(", "),
          channelSegment: l.channel,
        },
      });
    }
    return out.sort(
      (a, b) =>
        Date.parse(b.elig.lastActivityAt ?? "") - Date.parse(a.elig.lastActivityAt ?? "") || 0,
    );
  }, [pre.data, feeds, find]);

  const eligibleByChannel = useMemo(() => {
    const m: Partial<Record<ConvertChannel, number>> = {};
    for (const r of all) for (const ch of r.elig.channels) m[ch] = (m[ch] ?? 0) + 1;
    return m;
  }, [all]);

  return {
    rows: all.filter((r) => !r.converted),
    eligibleByChannel,
    isLoading: pre.isLoading,
    error: pre.error,
    connected: pre.data?.connected !== false,
  };
}

export function ReadyToConvert({
  feeds,
  ready,
}: {
  feeds: ConversionFeeds;
  ready: ReturnType<typeof useReadyToConvert>;
}) {
  const me = useMe().data;
  const { markConverted } = useConversions();
  const owners = useLeadOwners();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(100);

  const flagOn = !!me?.flags.leadConversion;
  const role = canAct(me?.user?.role, "agent");
  const blocked = !flagOn
    ? "Backend not connected yet"
    : !role
      ? "Requires agent or admin role"
      : undefined;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < MAX_BULK) n.add(id);
      return n;
    });

  async function convertSelected() {
    const rows = ready.rows.filter((r) => selected.has(r.preLead.id));
    if (!rows.length) return;
    setBusy(true);
    const tid = toast.loading(`Converting 0/${rows.length}…`);
    const ok: string[] = [];
    const dupes: string[] = [];
    const failed: string[] = [];
    for (const [i, r] of rows.entries()) {
      toast.loading(`Converting ${i + 1}/${rows.length}…`, { id: tid });
      const label = r.preLead.company || leadContactName(r.preLead) || r.preLead.phone;
      const identity = { id: r.preLead.id, phone: r.preLead.phone, email: r.preLead.email };
      const req = buildConvertRequest(
        r.subject,
        r.elig,
        buildLeadTimeline(identity, feeds),
        owners.data?.defaultOwnerId,
      );
      const res = await convertLead(req);
      if (res.ok) {
        ok.push(label);
        markConverted({
          leadId: res.leadId,
          preLeadId: r.preLead.id,
          convertedAt: res.convertedAt ?? new Date().toISOString(),
          convertedBy: me?.user?.email,
          repliedChannels: r.elig.channels,
          firstContactAt: r.elig.firstContactAt,
          firstReplyAt: r.elig.firstReplyAt,
          phone: r.preLead.phone,
          email: r.preLead.email,
        });
      } else if ("duplicate" in res && res.duplicate) dupes.push(label);
      else failed.push(`${label} (${"error" in res ? res.error : "failed"})`);
    }
    toast.dismiss(tid);
    const summary = [
      `${ok.length} converted`,
      dupes.length ? `${dupes.length} skipped as duplicates: ${dupes.join(", ")}` : "",
      failed.length ? `${failed.length} failed: ${failed.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (failed.length || dupes.length)
      toast.warning("Bulk conversion finished", { description: summary, duration: 15_000 });
    else toast.success("Bulk conversion finished", { description: summary });
    setSelected(new Set());
    setBusy(false);
  }

  if (ready.isLoading)
    return (
      <div className="space-y-2" aria-busy>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
        <p className="text-xs text-muted-foreground">
          Loading Pre-Leads (first load can take a minute)…
        </p>
      </div>
    );
  if (ready.error)
    return <EmptyState title="Couldn't load Pre-Leads" description={String(ready.error)} />;
  if (!ready.rows.length)
    return (
      <EmptyState
        title="Nobody is ready to convert"
        description="Pre-Leads appear here once they reply on WhatsApp, SMS, Viber, email, a call or website chat, and aren't Leads yet."
      />
    );

  const full = selected.size >= MAX_BULK;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {ready.rows.length} ready · {selected.size}/{MAX_BULK} selected
        </span>
        <DisabledReason
          disabled={!!blocked || !selected.size}
          reason={blocked ?? "Select Pre-Leads first"}
        >
          <button
            type="button"
            disabled={!!blocked || !selected.size || busy}
            onClick={convertSelected}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--rgf-red)] px-3 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="size-3.5" aria-hidden />
            )}
            Convert selected ({selected.size})
          </button>
        </DisabledReason>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius,14px)] border bg-[var(--surface,#fff)]">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="sticky top-0 border-b bg-[var(--surface,#fff)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-9 px-2 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-2 py-2">Pre-Lead</th>
              <th className="px-2 py-2">Phone</th>
              <th className="px-2 py-2">Replied on</th>
              <th className="px-2 py-2">First reply</th>
              <th className="px-2 py-2">Last activity</th>
              <th className="px-2 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {ready.rows.slice(0, limit).map((r) => {
              const id = r.preLead.id;
              const on = selected.has(id);
              const name = leadContactName(r.preLead);
              return (
                <tr key={id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--rgf-red)]"
                      aria-label={`Select ${r.preLead.company || name}`}
                      checked={on}
                      disabled={(!on && full) || busy}
                      title={!on && full ? `Up to ${MAX_BULK} at a time` : undefined}
                      onChange={() => toggle(id)}
                    />
                  </td>
                  <td className="max-w-[240px] px-2 py-2">
                    <div className="truncate font-medium">{r.preLead.company || name || "—"}</div>
                    {name && r.preLead.company && (
                      <div className="truncate text-[11px] text-muted-foreground">{name}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{r.preLead.phone || "—"}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {CONVERT_CHANNELS.filter((c) => r.elig.channels.includes(c)).map((c) => (
                        <ChannelChip key={c} channel={c} />
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <When ts={r.elig.firstReplyAt} />
                  </td>
                  <td className="px-2 py-2">
                    <When ts={r.elig.lastActivityAt} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <ConvertLeadButton subject={r.subject} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ready.rows.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 100)}
          className="w-full rounded-md border py-2 text-sm font-medium hover:bg-muted"
        >
          Show more ({ready.rows.length - limit} left)
        </button>
      )}
    </div>
  );
}
