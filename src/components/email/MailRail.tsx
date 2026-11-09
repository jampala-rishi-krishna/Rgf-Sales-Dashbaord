import { Bot, Inbox, Megaphone, Pencil, Send, Star, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAILBOXES, type MailboxKey } from "./types";

const ICONS: Record<MailboxKey, typeof Inbox> = {
  inbox: Inbox,
  starred: Star,
  sent: Send,
  "ai-replied": Bot,
  "needs-human": UserRound,
  openers: Megaphone,
};

export function ComposePill({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Compose"
      className={cn(
        "inline-flex items-center gap-3 rounded-2xl bg-[var(--ch-compose)] text-[#001D35] font-medium shadow-sm hover:shadow-md transition-shadow",
        compact ? "h-14 w-14 justify-center" : "h-14 pl-4 pr-6 text-sm",
      )}
    >
      <Pencil className="h-5 w-5" />
      {!compact && "Compose"}
    </button>
  );
}

export function MailRail({
  active,
  counts,
  unread,
  onSelect,
  onCompose,
}: {
  active: MailboxKey;
  counts: Record<MailboxKey, number>;
  unread: number;
  onSelect: (k: MailboxKey) => void;
  onCompose: () => void;
}) {
  return (
    <nav aria-label="Mailboxes" className="flex flex-col gap-1 w-[248px] shrink-0 pr-3 py-2">
      <div className="pl-2 pb-3">
        <ComposePill onClick={onCompose} />
      </div>
      {MAILBOXES.map(({ key, label, hint }) => {
        const Icon = ICONS[key];
        const isActive = key === active;
        const n = key === "inbox" ? unread : counts[key];
        return (
          <button
            key={key}
            type="button"
            title={hint}
            onClick={() => onSelect(key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-4 h-8 pl-6 pr-3 rounded-r-full text-sm text-[var(--ch-text)] hover:bg-black/5",
              isActive &&
                "bg-[var(--ch-nav-active)] hover:bg-[var(--ch-nav-active)] font-bold text-[#001D35] dark:text-[var(--ch-text)]",
            )}
          >
            <Icon
              className="h-[18px] w-[18px]"
              fill={key === "starred" && isActive ? "currentColor" : "none"}
            />
            <span className="flex-1 text-left truncate">{label}</span>
            {n > 0 && (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isActive || key === "inbox" ? "font-bold" : "",
                )}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
      <p className="px-6 pt-4 text-[11px] leading-4 text-[var(--ch-text-2)]">
        Counts cover loaded threads. Smart folders are inferred from thread direction &amp; length.
      </p>
    </nav>
  );
}

/** Mobile horizontal mailbox switcher. */
export function MailTabs({
  active,
  counts,
  onSelect,
}: {
  active: MailboxKey;
  counts: Record<MailboxKey, number>;
  onSelect: (k: MailboxKey) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto px-3 pb-2 md:hidden"
      role="tablist"
      aria-label="Mailboxes"
    >
      {MAILBOXES.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={key === active}
          onClick={() => onSelect(key)}
          className={cn(
            "shrink-0 h-8 px-3 rounded-full text-xs border border-gray-300 dark:border-white/20 text-[var(--ch-text)]",
            key === active && "bg-[var(--ch-nav-active)] border-transparent font-semibold",
          )}
        >
          {label}
          {key !== "inbox" && counts[key] > 0 && (
            <span className="ml-1 tabular-nums">{counts[key]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
