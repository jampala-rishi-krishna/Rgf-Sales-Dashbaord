// Cross-channel conversation for one lead (replaces the old CRM Lead 360 timeline).
// Reusable: pass the items from buildLeadTimeline(lead, feeds).
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/shared";
import type { TimelineItem } from "@/lib/conversion";
import { cn } from "@/lib/utils";
import { ChannelChip, When, hrefToLink } from "./format";

export function LeadTimeline({
  items,
  initial = 30,
  className,
}: {
  items: TimelineItem[];
  /** Show the latest N first; "Show earlier" reveals the rest. */
  initial?: number;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  if (!items.length)
    return (
      <EmptyState
        title="No conversation found"
        description="No WhatsApp, SMS, Viber, email, call or website messages match this lead's phone or email."
      />
    );
  const shown = all ? items : items.slice(-initial);
  const hidden = items.length - shown.length;
  return (
    <ol className={cn("space-y-2", className)} aria-label="Conversation across channels">
      {hidden > 0 && (
        <li className="text-center">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Show {hidden} earlier message{hidden === 1 ? "" : "s"}
          </button>
        </li>
      )}
      {shown.map((it, i) => {
        const inbound = it.direction === "in";
        return (
          <li
            key={`${it.channel}-${it.ts}-${i}`}
            className={cn("flex", inbound ? "justify-start" : "justify-end")}
          >
            <div
              className={cn(
                "max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ring-1 ring-black/5",
                inbound
                  ? "rounded-bl-md bg-[var(--surface,#fff)] dark:bg-white/5"
                  : "rounded-br-md bg-[color-mix(in_srgb,var(--rgf-red)_7%,var(--surface,#fff))] dark:bg-white/10",
              )}
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <ChannelChip channel={it.channel} className="py-0 text-[10px]" />
                <span className="font-semibold text-foreground/80">{it.who}</span>
                <When ts={it.ts} withTime />
                <Link
                  {...hrefToLink(it.href)}
                  className="ml-auto inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
                  aria-label={`Open in ${it.channel}`}
                  title="Open the original thread"
                >
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              </div>
              <p className="break-words whitespace-pre-wrap leading-relaxed">
                {it.text || <span className="text-muted-foreground italic">(no text)</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
