import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { DisabledReason } from "@/components/shared";
import { postAction } from "@/lib/action-client";
import { formatManila, type Conversation } from "@/lib/channels";
import { normalizePhPhone } from "@/lib/phone";
import { leadContactName, zohoRecordUrl, type PreLead } from "@/lib/crm";
import type { OutreachChannel } from "@/hooks/use-outreach-index";
import { OUTREACH_META, OutreachDots } from "@/components/crm/outreach-dots";
import { openerBody, type OpenerChannel } from "@/components/crm/bulk-actions";
import type { CrmRow } from "@/components/crm/crm-utils";

type Feeds = {
  whatsapp: Conversation[];
  sms: Conversation[];
  viber: Conversation[];
  web: Record<string, unknown>[];
  calls: Record<string, unknown>[];
};
type TimelineItem = {
  key: string;
  ts: string;
  channel: OutreachChannel;
  who: string;
  text: string;
};

function buildTimeline(lead: PreLead, feeds: Feeds) {
  const phone = lead.phone;
  const email = lead.email?.toLowerCase();
  const items: TimelineItem[] = [];
  const convs: { ch: OutreachChannel; c: Conversation }[] = [];
  for (const ch of ["whatsapp", "sms", "viber"] as const) {
    for (const c of feeds[ch]) {
      const hit =
        (phone && normalizePhPhone(c.phone) === phone) ||
        (c.leadId && c.leadId === lead.id) ||
        (email && c.leadEmail?.toLowerCase() === email);
      if (!hit) continue;
      convs.push({ ch, c });
      c.messages?.forEach((m, i) =>
        items.push({
          key: `${ch}-${c.phone}-${i}`,
          ts: m.ts,
          channel: ch,
          who:
            m.role === "customer"
              ? "Lead"
              : m.role === "human"
                ? (m.agentName ?? "Human")
                : "Martin (AI)",
          text: m.content,
        }),
      );
    }
  }
  for (const s of feeds.web) {
    const hit =
      (phone && normalizePhPhone(s.visitorPhone as string) === phone) ||
      (email && String(s.visitorEmail ?? "").toLowerCase() === email);
    if (!hit) continue;
    ((s.messages as { sender: string; text: string; timestamp: string }[]) ?? []).forEach((m, i) =>
      items.push({
        key: `web-${String(s.sessionId)}-${i}`,
        ts: m.timestamp,
        channel: "web",
        who: m.sender === "visitor" ? "Visitor" : "Martin (AI)",
        text: m.text,
      }),
    );
  }
  for (const c of feeds.calls) {
    const num = (c.customer as { number?: string } | undefined)?.number;
    if (!phone || normalizePhPhone(num) !== phone) continue;
    const summary = (c.analysis as { summary?: string } | undefined)?.summary;
    items.push({
      key: `call-${String(c.id)}`,
      ts: String(c.startedAt ?? c.createdAt ?? ""),
      channel: "call",
      who: "Mara (Voice)",
      text: `Call ${String(c.endedReason ?? c.status ?? "")}${summary ? ` — ${summary}` : ""}`,
    });
  }
  items.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return { items: items.slice(0, 300), convs };
}

type Props = {
  row: CrmRow | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  feeds: Feeds;
  canSend: boolean;
  singleCall: boolean;
};

export function LeadDrawer({ row, open, onOpenChange, feeds, canSend, singleCall }: Props) {
  const id = row?.lead.id;
  const detail = useQuery({
    queryKey: ["pre-lead", id],
    enabled: open && !!id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/crm/pre-lead?id=${encodeURIComponent(id!)}`, {
        credentials: "include",
      });
      if (!r.ok) return null;
      return ((await r.json()) as { lead?: PreLead }).lead ?? null;
    },
  });
  const lead = detail.data ?? row?.lead;
  const timeline = useMemo(
    () => (row && open ? buildTimeline(row.lead, feeds) : { items: [], convs: [] }),
    [row, open, feeds],
  );

  if (!row || !lead) return null;
  const contact = leadContactName(lead);

  const flags = timeline.convs.flatMap(({ ch, c }) => {
    const out: string[] = [];
    if (c.priceSent) out.push("Price list sent");
    if (c.brochureSent) out.push("Brochure sent");
    if (c.formSent) out.push("Form sent");
    if (c.meetingScheduled)
      out.push(`Meeting booked${c.meetingDateTime ? ` ${formatManila(c.meetingDateTime)}` : ""}`);
    if (c.humanEscalated) out.push("Escalated to human");
    if (c.discountAttempts) out.push(`${c.discountAttempts} discount attempt(s)`);
    return out.map((f) => ({ ch, f, link: c.meetingScheduled ? c.meetingLink : undefined }));
  });

  const openerReason = (ch: OpenerChannel) =>
    !canSend
      ? "Agent role required"
      : !lead.phone
        ? "No phone on record"
        : row.outreach[ch]?.contacted
          ? `Already contacted on ${OUTREACH_META[ch].label}`
          : undefined;
  const callReason = !singleCall
    ? "Single calls are turned off (FEATURE_SINGLE_CALL)"
    : !canSend
      ? "Agent role required"
      : !lead.phone
        ? "No phone on record"
        : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-channel="crm"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="border-b p-4" style={{ borderTop: "3px solid var(--ch)" }}>
          <SheetTitle className="pr-6 text-lg leading-tight">
            {lead.company || "Unnamed company"}
          </SheetTitle>
          <SheetDescription>
            {contact || "No contact name"}
            {lead.phone && <span className="ml-2 font-mono text-xs">{lead.phone}</span>}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {lead.channel && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--ch)_12%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--ch)]">
                {lead.channel}
              </span>
            )}
            {lead.products.map((p) => (
              <span key={p} className="rounded-full border px-2 py-0.5 text-[11px]">
                {p}
              </span>
            ))}
            <a
              href={zohoRecordUrl(lead.id)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs font-medium text-[var(--ch)] hover:underline"
            >
              Open in Zoho ↗
            </a>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section aria-label="Contact actions" className="grid grid-cols-2 gap-2">
            {(["whatsapp", "sms", "viber"] as const).map((ch) => {
              const reason = openerReason(ch);
              return (
                <DisabledReason key={ch} disabled={!!reason} reason={reason}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!!reason}
                    onClick={() =>
                      void postAction(
                        "/api/actions/opener",
                        openerBody(ch, lead),
                        `${OUTREACH_META[ch].label} opener sent`,
                      )
                    }
                  >
                    {OUTREACH_META[ch].label} opener
                  </Button>
                </DisabledReason>
              );
            })}
            <DisabledReason disabled={!!callReason} reason={callReason}>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!!callReason}
                onClick={() =>
                  void postAction(
                    "/api/actions/call",
                    { lead: openerBody("sms", lead).lead },
                    "Call started",
                  )
                }
              >
                Call
              </Button>
            </DisabledReason>
            <DisabledReason disabled={!lead.email} reason="No email on record">
              <Button
                size="sm"
                variant="outline"
                className="col-span-2 w-full"
                disabled={!lead.email}
                asChild={!!lead.email}
              >
                {lead.email ? (
                  <a href={`mailto:${lead.email}`}>Email {lead.email}</a>
                ) : (
                  <span>Email</span>
                )}
              </Button>
            </DisabledReason>
          </section>

          <section aria-label="Outreach">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Outreach · {row.stage}
            </h3>
            <OutreachDots outreach={row.outreach} />
            {flags.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {flags.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-full border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: OUTREACH_META[f.ch].color }}
                  >
                    {f.link ? (
                      <a href={f.link} target="_blank" rel="noreferrer" className="hover:underline">
                        {f.f}
                      </a>
                    ) : (
                      f.f
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Timeline">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cross-channel timeline
            </h3>
            {timeline.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No conversations found for this lead yet.
              </p>
            ) : (
              <ol className="relative space-y-3 border-l pl-4">
                {timeline.items.map((it) => (
                  <li key={it.key} className="relative">
                    <span
                      className="absolute top-1.5 -left-[21px] size-2.5 rounded-full"
                      style={{ background: OUTREACH_META[it.channel].color }}
                    />
                    <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
                      <span
                        className="font-medium"
                        style={{ color: OUTREACH_META[it.channel].color }}
                      >
                        {OUTREACH_META[it.channel].label}
                      </span>
                      <span>{it.who}</span>
                      <span className="ml-auto tabular-nums">{formatManila(it.ts)}</span>
                    </div>
                    <p className="line-clamp-4 text-sm whitespace-pre-wrap">{it.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <Accordion type="single" collapsible>
            <AccordionItem value="raw">
              <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Raw Zoho fields {detail.isFetching && "· loading…"}
              </AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-1 text-xs">
                  {Object.entries(lead.raw ?? {})
                    .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length))
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="truncate text-muted-foreground">{k}</dt>
                        <dd className="font-mono break-all">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
