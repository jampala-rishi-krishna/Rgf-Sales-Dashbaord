import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  ChevronDown,
  CircleDot,
  ExternalLink,
  MessageCircleReply,
  Send,
  UserPlus,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ZOHO_LEAD_URL,
  buildLeadTimeline,
  channelLabel,
  type ConversionFeeds,
  type TimelineItem,
} from "@/lib/conversion";
import type { LeadField } from "@/lib/leads";
import type { JoinedLead } from "@/lib/leads-join";
import type { PreLead } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { ChannelChip, StatusPill, When, hrefToLink } from "./format";
import { LeadTimeline } from "./LeadTimeline";

type Step = {
  key: string;
  ts?: string;
  title: string;
  detail?: string;
  icon: typeof CircleDot;
  tone?: "brand" | "good" | "muted";
  item?: TimelineItem;
};

const ms = (ts?: string) => {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const clip = (s: string, n = 110) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function buildJourney(
  row: JoinedLead,
  items: TimelineItem[],
  preLead?: Pick<PreLead, "createdTime">,
): Step[] {
  const steps: Step[] = [];
  const conv = row.conversion;
  if (preLead?.createdTime)
    steps.push({ key: "pre", ts: preLead.createdTime, title: "Pre-Lead created", icon: CircleDot });

  const firstOut = items.find((i) => i.direction === "out");
  const firstIn = items.find(
    (i) => i.direction === "in" && (!firstOut || ms(i.ts) >= ms(firstOut.ts)),
  );
  const outAt = firstOut?.ts ?? conv?.firstContactAt;
  if (outAt)
    steps.push({
      key: "out",
      ts: outAt,
      title: firstOut ? `First outreach · ${channelLabel(firstOut.channel)}` : "First outreach",
      detail: firstOut ? clip(firstOut.text) : undefined,
      icon: Send,
      item: firstOut,
    });
  const replyAt = firstIn?.ts ?? conv?.firstReplyAt;
  if (replyAt)
    steps.push({
      key: "reply",
      ts: replyAt,
      title: firstIn ? `First reply · ${channelLabel(firstIn.channel)}` : "First reply",
      detail: firstIn ? clip(firstIn.text) : undefined,
      icon: MessageCircleReply,
      tone: "good",
      item: firstIn,
    });

  const after = ms(replyAt ?? outAt);
  for (const [i, it] of items.entries()) {
    if (it === firstOut || it === firstIn || ms(it.ts) <= after) continue;
    steps.push({
      key: `m${i}`,
      ts: it.ts,
      title: `${it.direction === "in" ? "Lead" : it.who} · ${channelLabel(it.channel)}`,
      detail: clip(it.text),
      icon: ArrowLeftRight,
      tone: "muted",
      item: it,
    });
  }

  if (row.becameLeadAt)
    steps.push({
      key: "lead",
      ts: row.becameLeadAt,
      title: conv
        ? `Converted to Lead${conv.convertedBy ? ` by ${conv.convertedBy}` : ""}`
        : "Created as a Lead in Zoho",
      detail: conv?.repliedChannels?.length
        ? `Replied on ${conv.repliedChannels.map(channelLabel).join(", ")}`
        : row.lead.Lead_Source,
      icon: UserPlus,
      tone: "brand",
    });
  const mod = row.lead.Modified_Time;
  if (mod && ms(mod) > ms(row.becameLeadAt) + 60_000)
    steps.push({
      key: "zoho",
      ts: mod,
      title: `Updated in Zoho${row.status ? ` · ${row.status}` : ""}`,
      icon: BadgeCheck,
      tone: "muted",
    });
  return steps.sort((a, b) => ms(a.ts) - ms(b.ts));
}

const TONE: Record<NonNullable<Step["tone"]> | "default", string> = {
  default: "bg-muted text-foreground",
  brand: "bg-[var(--rgf-red)] text-white",
  good: "bg-green-600 text-white",
  muted: "bg-muted text-muted-foreground",
};

function Journey({ steps }: { steps: Step[] }) {
  const [all, setAll] = useState(false);
  // Keep the milestones; collapse the middle messages after the first 8.
  const middle = steps.filter((s) => s.key.startsWith("m"));
  const hiddenKeys = new Set(all ? [] : middle.slice(8).map((s) => s.key));
  const shown = steps.filter((s) => !hiddenKeys.has(s.key));
  if (!steps.length)
    return <p className="text-sm text-muted-foreground">No journey data for this lead yet.</p>;
  return (
    <>
      <ol className="relative space-y-3 border-l pl-5">
        {shown.map((s) => (
          <li key={s.key} className="relative">
            <span
              className={cn(
                "absolute -left-[31px] grid size-5 place-items-center rounded-full ring-4 ring-[var(--surface,#fff)]",
                TONE[s.tone ?? "default"],
              )}
            >
              <s.icon className="size-3" aria-hidden />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">{s.title}</span>
              <When ts={s.ts} withTime className="text-xs text-muted-foreground" />
            </div>
            {s.detail && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {s.item ? (
                  <Link {...hrefToLink(s.item.href)} className="hover:underline">
                    {s.detail}
                  </Link>
                ) : (
                  s.detail
                )}
              </p>
            )}
          </li>
        ))}
      </ol>
      {hiddenKeys.size > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-2 text-xs font-medium text-[var(--rgf-red)] hover:underline dark:text-[#E8505E]"
        >
          Show all {middle.length} messages
        </button>
      )}
    </>
  );
}

function fieldText(v: unknown): string {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return v.map(fieldText).filter(Boolean).join(", ");
  if (typeof v === "object")
    return "name" in (v as object) ? fieldText((v as { name: unknown }).name) : JSON.stringify(v);
  return String(v);
}

function AllFields({ row, fields }: { row: JoinedLead; fields: LeadField[] }) {
  const entries = useMemo(() => {
    const labels = new Map(fields.map((f) => [f.apiName, f.label]));
    const order = new Map(fields.map((f, i) => [f.apiName, i]));
    return Object.entries(row.lead)
      .filter(([k, v]) => k !== "id" && fieldText(v))
      .sort(([a], [b]) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6) || a.localeCompare(b))
      .map(([k, v]) => ({
        key: k,
        label: labels.get(k) ?? k.replace(/_/g, " "),
        value: fieldText(v),
      }));
  }, [row.lead, fields]);
  return (
    <dl className="divide-y text-sm">
      {entries.map((e) => (
        <div key={e.key} className="grid grid-cols-[40%_1fr] gap-3 py-1.5">
          <dt className="truncate text-muted-foreground" title={e.key}>
            {e.label}
          </dt>
          <dd className="min-w-0 break-words">{e.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function LeadDrawer({
  row,
  feeds,
  fields,
  preLead,
  onOpenChange,
}: {
  row: JoinedLead | undefined;
  feeds: ConversionFeeds;
  fields: LeadField[];
  preLead?: PreLead;
  onOpenChange: (open: boolean) => void;
}) {
  const items = useMemo(
    () =>
      row
        ? buildLeadTimeline(
            {
              id: row.conversion?.preLeadId || undefined,
              phone: row.phone,
              email: row.email,
              companyName: row.company,
            },
            feeds,
          )
        : [],
    [row, feeds],
  );
  const steps = useMemo(
    () => (row ? buildJourney(row, items, preLead) : []),
    [row, items, preLead],
  );
  const back = items.find((i) => i.direction === "in") ?? items[0];

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[560px]">
        {row && (
          <>
            <SheetHeader className="sticky top-0 z-10 space-y-2 border-b bg-background p-4 text-left">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <SheetTitle className="text-lg">{row.name || row.company || "Lead"}</SheetTitle>
                <StatusPill status={row.status} />
                {row.fromDashboard && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--rgf-red)_10%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--rgf-red)] dark:text-[#E8505E]">
                    <BadgeCheck className="size-3" aria-hidden /> From dashboard
                  </span>
                )}
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {row.company && row.name && <span>{row.company}</span>}
                {row.owner && <span>· Owner {row.owner}</span>}
                <ChannelChip channel={row.sourceChannel} />
              </SheetDescription>
              <div className="flex flex-wrap gap-2">
                <a
                  href={ZOHO_LEAD_URL(row.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
                >
                  Open in Zoho <ExternalLink className="size-3.5" aria-hidden />
                </a>
                {back && (
                  <Link
                    {...hrefToLink(back.href)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
                  >
                    Back to Pre-Lead · {channelLabel(back.channel)}
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {row.phone && <span className="font-mono">{row.phone}</span>}
                {row.email && <span>{row.email}</span>}
                {row.product && <span>{row.product}</span>}
              </div>
            </SheetHeader>
            <div className="space-y-6 p-4">
              <Section title="Journey">
                <Journey steps={steps} />
              </Section>
              <Section title={`Conversation (${items.length})`}>
                <LeadTimeline items={items} />
              </Section>
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                  All fields
                  <ChevronDown
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <AllFields row={row} fields={fields} />
                </CollapsibleContent>
              </Collapsible>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
