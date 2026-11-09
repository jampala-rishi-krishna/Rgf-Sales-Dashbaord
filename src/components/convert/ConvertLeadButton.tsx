import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, UserPlus } from "lucide-react";
import { DisabledReason } from "@/components/shared";
import { canAct, useMe } from "@/hooks/use-me";
import { useConversionFeeds } from "@/hooks/use-conversion-feeds";
import { useConversions } from "@/hooks/use-conversions";
import { buildLeadTimeline, getConversionEligibility, type LeadIdentity } from "@/lib/conversion";
import type { ConvertSubject } from "@/lib/convert-defaults";
import { cn } from "@/lib/utils";
import { ConvertLeadDialog } from "./ConvertLeadDialog";

export type { ConvertSubject } from "@/lib/convert-defaults";

const identity = (s: ConvertSubject): LeadIdentity => ({
  id: s.preLeadId || undefined,
  phone: s.phone,
  email: s.email,
  companyName: s.company,
});

/** Small "Converted" pill, rendered only when the subject is already a Lead. */
export function ConvertedBadge({
  subject,
  className,
}: {
  subject: ConvertSubject;
  className?: string;
}) {
  const { find } = useConversions();
  if (!find(identity(subject))) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
        className,
      )}
    >
      <BadgeCheck className="size-3" aria-hidden />
      Converted
    </span>
  );
}

/**
 * "Convert to Lead" for one Pre-Lead / conversation. Becomes "View Lead" once converted.
 * Disabled (with the reason as tooltip) when the flag is off, the role is viewer, or the
 * lead has no two-way interaction yet.
 */
export function ConvertLeadButton({
  subject,
  size = "sm",
  className,
  tone = "light",
  full,
}: {
  subject: ConvertSubject;
  size?: "sm" | "md";
  className?: string;
  /** "dark" for coloured headers (white button text). */
  tone?: "light" | "dark";
  /** Full-width with visible label at every breakpoint (drawers). */
  full?: boolean;
}) {
  const me = useMe();
  const { feeds } = useConversionFeeds({ email: !!subject.email });
  const { find } = useConversions();
  const [open, setOpen] = useState(false);
  const id = identity(subject);
  const elig = useMemo(
    () => getConversionEligibility(id, feeds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feeds, id.id, id.phone, id.email, id.companyName],
  );
  const timeline = useMemo(
    () => (open ? buildLeadTimeline(id, feeds) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, feeds, id.id, id.phone, id.email],
  );

  const base = cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
    full && "w-full",
    className,
  );
  const label = (text: string) => (
    <span className={full ? undefined : "sr-only sm:not-sr-only"}>{text}</span>
  );

  const converted = find(id);
  if (converted) {
    return (
      <Link
        to="/leads"
        search={{ id: converted.leadId }}
        title="Already converted — view the Lead"
        className={cn(
          base,
          tone === "dark"
            ? "bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white"
            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 focus-visible:ring-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300",
        )}
      >
        <BadgeCheck className="size-4" aria-hidden />
        {label("View Lead")}
      </Link>
    );
  }

  const flagOn = !!me.data?.flags.leadConversion;
  const allowed = canAct(me.data?.user?.role, "agent");
  const reason = !flagOn
    ? "Backend not connected yet"
    : !allowed
      ? "Requires agent or admin role"
      : !elig.eligible
        ? elig.reason
        : undefined;
  const disabled = !!reason;

  return (
    <>
      <DisabledReason disabled={disabled} reason={reason}>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          aria-label={full ? undefined : "Convert to Lead"}
          title={disabled ? undefined : elig.reason}
          className={cn(
            base,
            tone === "dark"
              ? "bg-white text-[#86000B] hover:bg-white/90 focus-visible:ring-white"
              : "bg-[var(--rgf-red,#86000B)] text-white hover:bg-[#6E0009] focus-visible:ring-[#86000B]",
          )}
        >
          <UserPlus className="size-4" aria-hidden />
          {label("Convert to Lead")}
        </button>
      </DisabledReason>
      {open && (
        <ConvertLeadDialog
          open={open}
          onOpenChange={setOpen}
          subject={subject}
          eligibility={elig}
          timeline={timeline}
        />
      )}
    </>
  );
}
