import type { ReactNode } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatManila, hasReplied, type Conversation } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "./ConversationList";
import { displayName } from "./utils";
import { ConvertedBadge } from "@/components/convert/ConvertLeadButton";
import { PreLeadPanel } from "@/components/convert/PreLeadPanel";
import { conversationSubject } from "@/components/convert/subjects";

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium",
        on
          ? "border-transparent bg-[var(--ch-primary,#00a884)] text-white"
          : "text-muted-foreground",
      )}
    >
      {on ? "✓ " : ""}
      {label}
    </span>
  );
}

export function LeadInfoDrawer({
  conversation: c,
  open,
  onOpenChange,
  extra,
}: {
  conversation: Conversation | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extra?: ReactNode;
}) {
  return (
    <Sheet open={open && !!c} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {c && (
          <>
            <SheetHeader className="items-center text-center">
              <InitialsAvatar name={displayName(c)} size={96} />
              <SheetTitle className="text-xl">{displayName(c)}</SheetTitle>
              <SheetDescription>{c.phone}</SheetDescription>
              <ConvertedBadge subject={conversationSubject(c)} />
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              {(c.duplicateRowCount ?? 0) > 1 && (
                <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {c.duplicateRowCount} duplicate rows exist for this lead in the sheet — data may
                    be merged from several rows.
                  </span>
                </div>
              )}
              <PreLeadPanel subject={conversationSubject(c)} />
              {extra}
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Lead
                </h3>
                <dl className="divide-y">
                  <Row label="Name">{c.leadName}</Row>
                  <Row label="Company">{c.companyName}</Row>
                  <Row label="Phone">
                    <span className="font-mono">{c.phone}</span>
                  </Row>
                  <Row label="Email">{c.leadEmail}</Row>
                  <Row label="Product">{c.product}</Row>
                  <Row label="Stage">{c.conversationStage?.replace(/_/g, " ")}</Row>
                  <Row label="Last action">{c.lastAction?.replace(/_/g, " ")}</Row>
                  <Row label="Replied">{hasReplied(c) ? "Yes" : "No"}</Row>
                  <Row label="Discount attempts">{String(c.discountAttempts ?? 0)}</Row>
                  <Row label="Last activity">{formatManila(c.lastMessageAt)}</Row>
                  <Row label="Messages">{String(c.messages.length)}</Row>
                </dl>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Progress
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  <Flag on={c.brochureSent} label="Brochure" />
                  <Flag on={c.priceSent} label="Price list" />
                  <Flag on={c.formSent} label="Form" />
                  <Flag on={c.meetingScheduled} label="Meeting" />
                  <Flag on={c.humanEscalated} label="Escalated" />
                </div>
              </section>
              {(c.meetingScheduled || c.meetingLink) && (
                <section className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">
                    Meeting{" "}
                    {c.meetingDateTime
                      ? `· ${formatManila(c.meetingDateTime, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : ""}
                  </div>
                  {c.meetingLink && (
                    <a
                      href={c.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[var(--ch-primary,#008069)] underline"
                    >
                      Join Google Meet <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
