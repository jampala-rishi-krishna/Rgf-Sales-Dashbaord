import type { ReactNode } from "react";
import { ArrowLeft, Info } from "lucide-react";
import type { Conversation } from "@/lib/channels";
import { formatManila } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "./ConversationList";
import { displayName, type ChatVariant } from "./utils";

export interface ConversationHeaderProps {
  conversation: Conversation;
  variant: ChatVariant;
  onBack: () => void;
  onInfo: () => void;
  /** Extra chips (e.g. Viber delivery / SMS fallback). */
  chips?: ReactNode;
}

export function ConversationHeader({
  conversation: c,
  variant,
  onBack,
  onInfo,
  chips,
}: ConversationHeaderProps) {
  const name = displayName(c);
  const sub = [
    c.leadName && c.companyName ? c.companyName : null,
    c.phone !== name ? c.phone : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <header
      className={cn(
        "flex min-h-[59px] shrink-0 items-center gap-3 px-3 py-2",
        variant === "whatsapp" && "bg-[var(--ch-header,#f0f2f5)]",
        variant !== "whatsapp" &&
          "border-b border-[var(--ch-divider,#e9edef)] bg-[var(--ch-panel,#fff)]",
      )}
    >
      <button
        onClick={onBack}
        className="rounded-full p-1.5 text-[var(--ch-text-2,#54656f)] hover:bg-black/5 md:hidden"
        aria-label="Back to conversations"
      >
        <ArrowLeft className="size-5" />
      </button>
      <button
        onClick={onInfo}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label="Open lead info"
      >
        <InitialsAvatar name={name} size={40} />
        <div className="min-w-0">
          <div className="truncate text-[16px] font-medium text-[var(--ch-text,#111b21)]">
            {name}
          </div>
          <div className="truncate text-[12.5px] text-[var(--ch-text-2,#667781)]">
            {sub || `Last active ${formatManila(c.lastMessageAt)}`}
          </div>
        </div>
      </button>
      {chips && <div className="hidden shrink-0 items-center gap-1.5 sm:flex">{chips}</div>}
      <button
        onClick={onInfo}
        className="rounded-full p-2 text-[var(--ch-text-2,#54656f)] hover:bg-black/5"
        aria-label="Lead info"
      >
        <Info className="size-5" />
      </button>
    </header>
  );
}
