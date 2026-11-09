import type { ReactNode } from "react";
import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePreLeadLookup } from "@/hooks/use-pre-lead-lookup";
import { formatManila } from "@/lib/channels";
import type { ConvertSubject } from "@/lib/convert-defaults";
import { ConvertLeadButton, ConvertedBadge } from "./ConvertLeadButton";

const s = (v: unknown) =>
  v === null || v === undefined || v === "" ? "" : typeof v === "string" ? v : String(v);

/** Fill the conversation's subject with what Zoho knows (id, company, phone, product…). */
export function enrichSubject(
  subject: ConvertSubject,
  lead: Record<string, unknown> | null | undefined,
): ConvertSubject {
  if (!lead) return subject;
  const name = [s(lead.First_Name), s(lead.Last_Name)].filter(Boolean).join(" ");
  return {
    ...subject,
    preLeadId: subject.preLeadId || s(lead.id) || undefined,
    name: subject.name || name || undefined,
    company: subject.company || s(lead.Name) || undefined,
    phone: subject.phone || s(lead.Lead_Phone) || s(lead.Company_Phone) || undefined,
    email: subject.email || s(lead.Email) || s(lead.Company_Email) || undefined,
    product: subject.product || s(lead.Associated_Products) || undefined,
    channelSegment: subject.channelSegment || s(lead.Channel) || undefined,
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

const SHOWN = new Set([
  "id",
  "First_Name",
  "Last_Name",
  "Name",
  "Lead_Phone",
  "Email",
  "Associated_Products",
  "Channel",
  "Owner",
  "Province",
  "City_Municipality",
  "Created_Time",
]);

/**
 * Zoho Pre-Lead details for a conversation: key fields, Convert to Lead, Open in Zoho CRM
 * and a collapsible "All fields". Looks the Pre-Lead up by id, phone or email.
 */
export function PreLeadPanel({
  subject,
  showConvert = true,
}: {
  subject: ConvertSubject;
  showConvert?: boolean;
}) {
  const q = usePreLeadLookup({ id: subject.preLeadId, phone: subject.phone, email: subject.email });
  const lead = q.data?.found ? q.data.lead : null;
  const full = enrichSubject(subject, lead);
  const labels = new Map((q.data?.fields ?? []).map((f) => [f.apiName, f.label]));
  const extra = lead
    ? Object.entries(lead).filter(
        ([k, v]) => !SHOWN.has(k) && !k.endsWith("_id") && s(v) && typeof v !== "object",
      )
    : [];
  const who = [subject.email, subject.phone].filter(Boolean).join(" or ") || "this contact";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Zoho Pre-Lead
        </h3>
        <ConvertedBadge subject={full} />
      </div>

      {q.isLoading && (
        <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Looking up the Pre-Lead in Zoho…
        </div>
      )}
      {!q.isLoading && q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Could not reach Zoho right now.{" "}
          <button type="button" className="underline" onClick={() => q.refetch()}>
            Retry
          </button>
        </div>
      )}
      {!q.isLoading && q.data && !q.data.found && (
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          {q.data.connected === false
            ? "Pre-Lead lookup is not connected yet."
            : `No Pre-Lead in Zoho matches ${who}.`}
        </div>
      )}

      {lead && (
        <dl className="divide-y rounded-lg border px-3">
          <Row label="Company">{s(lead.Name)}</Row>
          <Row label="Contact">
            {[s(lead.First_Name), s(lead.Last_Name)].filter(Boolean).join(" ")}
          </Row>
          <Row label="Phone">
            {s(lead.Lead_Phone) && <span className="font-mono">{s(lead.Lead_Phone)}</span>}
          </Row>
          <Row label="Email">{s(lead.Email)}</Row>
          <Row label="Products">{s(lead.Associated_Products)}</Row>
          <Row label="Channel">{s(lead.Channel)}</Row>
          <Row label="Owner">{s(lead.Owner)}</Row>
          <Row label="Location">
            {[s(lead.City_Municipality), s(lead.Province)].filter(Boolean).join(", ")}
          </Row>
          <Row label="Created">{lead.Created_Time ? formatManila(s(lead.Created_Time)) : ""}</Row>
        </dl>
      )}

      {showConvert && <ConvertLeadButton subject={full} size="md" full />}

      {q.data?.zohoUrl && (
        <a
          href={q.data.zohoUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Open Pre-Lead in Zoho CRM <ExternalLink className="size-4" aria-hidden />
        </a>
      )}

      {extra.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            All fields ({extra.length})
            <ChevronDown
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-2 divide-y rounded-lg border px-3">
              {extra.map(([k, v]) => (
                <Row key={k} label={labels.get(k) ?? k.replace(/_/g, " ")}>
                  {/^https?:\/\//.test(s(v)) ? (
                    <a href={s(v)} target="_blank" rel="noreferrer" className="underline">
                      Link
                    </a>
                  ) : /_Time$/.test(k) ? (
                    formatManila(s(v))
                  ) : (
                    s(v)
                  )}
                </Row>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}
