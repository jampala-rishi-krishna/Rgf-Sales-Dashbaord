import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmSendDialog, DisabledReason } from "@/components/shared";
import { postAction } from "@/lib/action-client";
import { leadContactName, type PreLead } from "@/lib/crm";
import { exportCsv, sleep, type CrmRow } from "@/components/crm/crm-utils";

export const OPENER_CAP = 50;
export type OpenerChannel = "whatsapp" | "sms" | "viber";
const LABEL: Record<OpenerChannel, string> = { whatsapp: "WhatsApp", sms: "SMS", viber: "Viber" };

export function openerBody(channel: OpenerChannel, l: PreLead) {
  return {
    channel,
    lead: {
      leadId: l.id,
      leadName: leadContactName(l),
      companyName: l.company,
      phone: l.phone,
      product: l.products[0] ?? "",
      channel: l.channel ?? "",
    },
  };
}

type Props = { selected: CrmRow[]; canSend: boolean; onClear: () => void; onDone?: () => void };

export function BulkActions({ selected, canSend, onClear, onDone }: Props) {
  const [pending, setPending] = useState<OpenerChannel | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const withPhone = selected.filter((r) => r.lead.phone);
  const tooMany = withPhone.length > OPENER_CAP;
  const reason = !canSend
    ? "Agent role required"
    : running
      ? "A send is already running"
      : withPhone.length === 0
        ? "No selected lead has a phone"
        : tooMany
          ? `Select at most ${OPENER_CAP} leads with phones (${withPhone.length} selected)`
          : undefined;

  async function run(channel: OpenerChannel) {
    const targets = withPhone.slice(0, OPENER_CAP);
    stopRef.current = false;
    setRunning(true);
    const id = toast.loading(`${LABEL[channel]} openers: 0 / ${targets.length}`, {
      action: { label: "Stop", onClick: () => (stopRef.current = true) },
      duration: Infinity,
    });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < targets.length; i++) {
      if (stopRef.current) break;
      const r = await postAction(
        "/api/actions/opener",
        openerBody(channel, targets[i].lead),
        `${LABEL[channel]} opener → ${targets[i].lead.company}`,
      );
      if (r.ok) ok++;
      else fail++;
      toast.loading(
        `${LABEL[channel]} openers: ${i + 1} / ${targets.length}${fail ? ` (${fail} failed)` : ""}`,
        { id },
      );
      if (i < targets.length - 1 && !stopRef.current) await sleep(3000 + Math.random() * 3000);
    }
    const msg = `${LABEL[channel]} openers ${stopRef.current ? "stopped" : "done"}: ${ok} sent${fail ? `, ${fail} failed` : ""}`;
    if (fail && !ok) toast.error(msg, { id, duration: 6000, action: undefined });
    else toast.success(msg, { id, duration: 6000, action: undefined });
    setRunning(false);
    onDone?.();
  }

  if (!selected.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius,14px)] border bg-[color-mix(in_srgb,var(--ch)_8%,var(--surface,#fff))] px-3 py-2 text-sm">
      <span className="font-medium tabular-nums">{selected.length.toLocaleString()} selected</span>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
      <span className="mx-1 h-5 w-px bg-border" />
      {(Object.keys(LABEL) as OpenerChannel[]).map((ch) => (
        <DisabledReason key={ch} disabled={!!reason} reason={reason}>
          <Button size="sm" variant="outline" disabled={!!reason} onClick={() => setPending(ch)}>
            Send {LABEL[ch]} opener
          </Button>
        </DisabledReason>
      ))}
      <Button size="sm" variant="outline" onClick={() => exportCsv(selected, "pre-leads-selected")}>
        Export CSV
      </Button>
      {pending && (
        <ConfirmSendDialog
          open={!!pending}
          onOpenChange={(o: boolean) => !o && setPending(null)}
          channelLabel={`${LABEL[pending]} opener`}
          count={Math.min(withPhone.length, OPENER_CAP)}
          sampleCompanies={withPhone.slice(0, 5).map((r) => r.lead.company)}
          onConfirm={() => {
            const ch = pending;
            setPending(null);
            void run(ch);
          }}
        />
      )}
    </div>
  );
}
