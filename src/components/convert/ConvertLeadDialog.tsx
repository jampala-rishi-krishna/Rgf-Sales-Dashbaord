import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, ExternalLink, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConversions } from "@/hooks/use-conversions";
import { useLeadOwners } from "./use-lead-owners";
import { buildConvertRequest, type ConvertSubject } from "@/lib/convert-defaults";
import { convertLead } from "@/lib/convert-client";
import {
  LEAD_SOURCE,
  LEAD_STATUSES,
  ZOHO_LEAD_URL,
  channelLabel,
  type ConversionEligibility,
  type ConvertLeadInput,
  type TimelineItem,
} from "@/lib/conversion";

type Duplicate = { existingLeadId: string; existingZohoUrl?: string; matchedOn?: string };

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

function Field({
  id,
  label,
  required,
  children,
  wide,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label htmlFor={id} className="mb-1.5 block text-xs font-medium">
        {label}
        {required && (
          <span aria-hidden className="text-destructive">
            {" "}
            *
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}

export function ConvertLeadDialog({
  open,
  onOpenChange,
  subject,
  eligibility,
  timeline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: ConvertSubject;
  eligibility: ConversionEligibility;
  timeline: TimelineItem[];
}) {
  const owners = useLeadOwners(open);
  const { markConverted } = useConversions();
  const initial = useMemo(
    () => buildConvertRequest(subject, eligibility, timeline),
    // Rebuild only when the dialog (re)opens, so typing isn't overwritten by feed polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );
  const [form, setForm] = useState<ConvertLeadInput>(initial.lead);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial.lead);
    setError("");
    setDuplicate(null);
  }, [open, initial]);

  // Apply the default owner once the list arrives (unless the user picked one).
  const defaultOwner = owners.data?.defaultOwnerId;
  useEffect(() => {
    if (open && defaultOwner) setForm((f) => (f.ownerId ? f : { ...f, ownerId: defaultOwner }));
  }, [open, defaultOwner]);

  const set = (k: keyof ConvertLeadInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = !!form.company.trim() && !!form.lastName.trim();

  async function submit(force = false) {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const lead: ConvertLeadInput = {
      ...form,
      lastName: form.lastName.trim() || "Unknown",
      ownerId: form.ownerId || undefined,
    };
    const res = await convertLead({ ...initial, lead, force: force || undefined });
    setBusy(false);
    if (res.ok) {
      const url = res.zohoUrl ?? ZOHO_LEAD_URL(res.leadId);
      markConverted({
        leadId: res.leadId,
        preLeadId: initial.preLeadId,
        convertedAt: res.convertedAt ?? new Date().toISOString(),
        repliedChannels: initial.repliedChannels,
        phone: lead.phone,
        email: lead.email,
      });
      if (res.dryRun)
        toast.success("Dry run: no Lead created", {
          description: `${lead.company} would be converted to a Zoho Lead.`,
        });
      else
        toast.success(`${lead.company} converted to a Lead`, {
          action: { label: "Open in Zoho", onClick: () => window.open(url, "_blank", "noopener") },
        });
      onOpenChange(false);
      return;
    }
    if ("duplicate" in res && res.duplicate) {
      setDuplicate(res);
      return;
    }
    setError("error" in res ? res.error : "Convert failed");
  }

  const replied = eligibility.channels.map(channelLabel).join(", ");

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Convert to Lead</DialogTitle>
          <DialogDescription>
            Creates a Zoho Lead from this Pre-Lead{replied ? ` (replied on ${replied})` : ""}. Check
            the details before converting.
          </DialogDescription>
        </DialogHeader>

        {duplicate && (
          <div
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <div className="font-semibold">Already a Lead</div>
            <p className="mt-0.5">
              A Zoho Lead with the same {duplicate.matchedOn ?? "phone or email"} already exists.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <a
                  href={duplicate.existingZohoUrl ?? ZOHO_LEAD_URL(duplicate.existingLeadId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open existing <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => submit(true)}>
                Convert anyway
              </Button>
            </div>
          </div>
        )}

        <form
          id="convert-lead-form"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field id="cl-first" label="First name">
            <Input
              id="cl-first"
              value={form.firstName}
              onChange={(e) => set("firstName")(e.target.value)}
            />
          </Field>
          <Field id="cl-last" label="Last name" required>
            <Input
              id="cl-last"
              required
              value={form.lastName}
              onChange={(e) => set("lastName")(e.target.value)}
            />
          </Field>
          <Field id="cl-company" label="Company" required wide>
            <Input
              id="cl-company"
              required
              value={form.company}
              onChange={(e) => set("company")(e.target.value)}
            />
          </Field>
          <Field id="cl-phone" label="Phone">
            <Input
              id="cl-phone"
              inputMode="tel"
              className="font-mono"
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
            />
          </Field>
          <Field id="cl-email" label="Email">
            <Input
              id="cl-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
            />
          </Field>
          <Field id="cl-product" label="Product interest">
            <Input
              id="cl-product"
              value={form.product}
              onChange={(e) => set("product")(e.target.value)}
            />
          </Field>
          <Field id="cl-segment" label="Channel segment">
            <Input
              id="cl-segment"
              value={form.channel}
              onChange={(e) => set("channel")(e.target.value)}
            />
          </Field>
          <Field id="cl-source" label="Lead source">
            <select
              id="cl-source"
              className={selectCls}
              value={form.leadSource}
              onChange={(e) => set("leadSource")(e.target.value)}
            >
              {[...new Set([form.leadSource, ...Object.values(LEAD_SOURCE)])]
                .filter(Boolean)
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
          </Field>
          <Field id="cl-status" label="Lead status">
            <select
              id="cl-status"
              className={selectCls}
              value={form.leadStatus}
              onChange={(e) => set("leadStatus")(e.target.value)}
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field id="cl-owner" label="Owner" wide>
            <select
              id="cl-owner"
              className={selectCls}
              value={form.ownerId ?? ""}
              onChange={(e) => set("ownerId")(e.target.value)}
              disabled={owners.isLoading}
            >
              <option value="">
                {owners.isLoading ? "Loading owners…" : "Default owner (assigned in Zoho)"}
              </option>
              {(owners.data?.owners ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="cl-notes" label="Notes" wide>
            <Textarea
              id="cl-notes"
              rows={6}
              maxLength={2000}
              className="font-mono text-xs"
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </Field>
        </form>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="convert-lead-form" disabled={!valid || busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserCheck className="size-4" aria-hidden />
            )}
            {busy ? "Converting…" : "Convert to Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
