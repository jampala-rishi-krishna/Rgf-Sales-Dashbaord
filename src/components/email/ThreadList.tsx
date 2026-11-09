import { forwardRef } from "react";
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MailOpen,
  Paperclip,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";
import {
  displayName,
  formatFullDate,
  formatListDate,
  type ChipKey,
  type GmailThreadSummary,
} from "./types";

const CHIPS: { key: ChipKey; label: string; disabledReason?: string }[] = [
  { key: "has-reply", label: "Has reply" },
  { key: "from-lead", label: "From lead" },
  {
    key: "has-attachment",
    label: "Has attachment",
    disabledReason: "Attachment info isn't returned by the thread list yet",
  },
  { key: "last-7d", label: "Last 7 days" },
];

export const GmailSearch = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void }
>(function GmailSearch({ value, onChange }, ref) {
  return (
    <div className="flex items-center h-12 rounded-full bg-[#E9EEF6] dark:bg-white/10 focus-within:bg-white focus-within:shadow-[0_1px_3px_rgba(60,64,67,.3)] dark:focus-within:bg-[#2D2F31] transition px-2 w-full max-w-[720px]">
      <span className="h-10 w-10 grid place-items-center text-[var(--ch-text-2)]">
        <Search className="h-5 w-5" />
      </span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search mail"
        aria-label="Search mail"
        className="flex-1 bg-transparent outline-none text-base text-[var(--ch-text)] placeholder:text-[var(--ch-text-2)]"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="h-10 w-10 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)]"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
});

export function FilterChips({
  active,
  onToggle,
}: {
  active: Set<ChipKey>;
  onToggle: (k: ChipKey) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-3 md:px-4 py-2" aria-label="Filters">
      {CHIPS.map(({ key, label, disabledReason }) => {
        const on = active.has(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            disabled={!!disabledReason}
            title={disabledReason}
            onClick={() => onToggle(key)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-lg border text-sm text-[var(--ch-text)] transition",
              on
                ? "bg-[var(--ch-nav-active)] border-transparent"
                : "border-gray-300 dark:border-white/20 hover:bg-black/5",
              disabledReason && "opacity-50 cursor-not-allowed hover:bg-transparent",
            )}
          >
            {on && <Check className="h-4 w-4" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Row({
  t,
  selected,
  checked,
  onOpen,
  onCheck,
  onStar,
  onDelete,
  deleteDisabled,
}: {
  t: GmailThreadSummary;
  selected: boolean;
  checked: boolean;
  onOpen: () => void;
  onCheck: () => void;
  onStar: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
}) {
  const who = t.direction === "outbound" ? `me, ${displayName(t.to)}` : displayName(t.from);
  return (
    <li
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group relative flex items-center gap-1 md:gap-2 h-auto md:h-10 py-2 md:py-0 pl-1 md:pl-2 pr-4 cursor-pointer border-b border-gray-100 dark:border-white/5 transition-shadow",
        t.isUnread ? "bg-[var(--ch-panel)]" : "bg-[var(--ch-row-read)]",
        (checked || selected) && "bg-[var(--ch-row-selected)]",
        "hover:z-10 hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)]",
        "focus-visible:outline-2 focus-visible:outline-[var(--ch-link)]",
      )}
    >
      <label
        className="h-10 w-8 grid place-items-center shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          aria-label={`Select ${t.subject}`}
          className="h-4 w-4 accent-[#0B57D0]"
        />
      </label>
      <button
        type="button"
        aria-label={t.isFlagged ? "Unstar" : "Star"}
        aria-pressed={t.isFlagged}
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
        className="h-8 w-8 grid place-items-center rounded-full hover:bg-black/5 shrink-0"
      >
        <Star
          className="h-[18px] w-[18px]"
          style={{ color: t.isFlagged ? "var(--ch-star)" : "var(--ch-text-2)" }}
          fill={t.isFlagged ? "var(--ch-star)" : "none"}
        />
      </button>
      <button
        type="button"
        aria-label={`Delete ${t.subject}`}
        title="Move conversation to Trash"
        disabled={deleteDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className="h-8 w-8 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)] disabled:opacity-30 shrink-0"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center md:gap-3">
        <span
          className={cn(
            "md:w-[200px] shrink-0 truncate text-sm text-[var(--ch-text)]",
            t.isUnread && "font-bold",
          )}
        >
          {t.direction === "outbound" && (
            <Bot
              className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-[#86000B]"
              aria-label="Sent by Martin (AI)"
            />
          )}
          {who}
          {t.messageCount > 1 && (
            <span className="ml-1 text-xs font-normal text-[var(--ch-text-2)]">
              {t.messageCount}
            </span>
          )}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm">
          <span className={cn("text-[var(--ch-text)]", t.isUnread && "font-bold")}>
            {t.subject || "(no subject)"}
          </span>
          <span className="text-[var(--ch-text-2)]"> — {t.snippet}</span>
        </span>
        {t.hasAttachment && (
          <span className="hidden md:inline-flex items-center gap-1 h-6 px-2 rounded-full border border-gray-300 text-xs text-[var(--ch-text-2)]">
            <Paperclip className="h-3 w-3" /> Attachment
          </span>
        )}
      </div>
      <time
        dateTime={t.date}
        title={formatFullDate(t.date)}
        className={cn(
          "absolute md:static top-2 right-4 text-xs shrink-0 md:w-16 text-right text-[var(--ch-text-2)] md:group-hover:invisible",
          t.isUnread && "font-bold text-[var(--ch-text)]",
        )}
      >
        {formatListDate(t.date)}
      </time>
      <div className="hidden md:group-hover:flex absolute right-3 items-center gap-1 bg-inherit">
        <button
          type="button"
          aria-label="Open"
          title="Open"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="h-8 w-8 grid place-items-center rounded-full hover:bg-black/10 text-[var(--ch-text-2)]"
        >
          <MailOpen className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export function ThreadList({
  threads,
  rangeStart,
  totalLabel,
  canPrev,
  canNext,
  onPrev,
  onNext,
  loading,
  fetching,
  error,
  onRefresh,
  selectedId,
  checked,
  onToggleCheck,
  onToggleAll,
  onOpen,
  onStar,
  onDelete,
  deleteDisabled,
}: {
  threads: GmailThreadSummary[];
  rangeStart: number;
  totalLabel: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
  fetching: boolean;
  error: string | null;
  onRefresh: () => void;
  selectedId: string | null;
  checked: Set<string>;
  onToggleCheck: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (t: GmailThreadSummary) => void;
  onStar: (t: GmailThreadSummary) => void;
  onDelete: (ids: string[]) => void;
  deleteDisabled: boolean;
}) {
  const allChecked = threads.length > 0 && threads.every((t) => checked.has(t.threadId));
  const rangeEnd = rangeStart + threads.length;
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center h-12 px-2 md:px-4 gap-1 border-b border-gray-100 dark:border-white/5 shrink-0">
        <label className="h-10 w-8 grid place-items-center">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={onToggleAll}
            aria-label="Select all on page"
            className="h-4 w-4 accent-[#0B57D0]"
          />
        </label>
        {checked.size > 0 && (
          <button
            type="button"
            onClick={() => onDelete([...checked])}
            disabled={deleteDisabled}
            title="Move selected conversations to Trash"
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm hover:bg-black/5 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Delete ({checked.size})
          </button>
        )}
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh"
          title="Refresh"
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)]"
        >
          <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-[var(--ch-text-2)] tabular-nums px-2">
          {threads.length ? `${rangeStart + 1}–${rangeEnd} of ${totalLabel}` : `0 of ${totalLabel}`}
        </span>
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Newer"
          title="Newer"
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext || fetching}
          aria-label="Older"
          title="Older"
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          {fetching && canNext ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </button>
      </div>
      {error && (
        <div className="mx-4 my-2 rounded-lg bg-[#FCE8E6] text-[#C5221F] text-sm px-3 py-2">
          {error}
        </div>
      )}
      <ul role="grid" aria-label="Threads" className="flex-1 overflow-y-auto">
        {loading &&
          Array.from({ length: 10 }).map((_, i) => (
            <li
              key={i}
              className="h-10 border-b border-gray-100 dark:border-white/5 px-4 flex items-center gap-4"
            >
              <div className="h-3 w-40 rounded bg-gray-200 dark:bg-white/10 animate-pulse" />
              <div className="h-3 flex-1 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
            </li>
          ))}
        {!loading && threads.length === 0 && !error && (
          <li className="py-16">
            <EmptyState
              title="No conversations here"
              description="Try another folder, clear filters, or load older mail."
            />
          </li>
        )}
        {threads.map((t) => (
          <Row
            key={t.threadId}
            t={t}
            selected={t.threadId === selectedId}
            checked={checked.has(t.threadId)}
            onOpen={() => onOpen(t)}
            onCheck={() => onToggleCheck(t.threadId)}
            onStar={() => onStar(t)}
            onDelete={() => onDelete([t.threadId])}
            deleteDisabled={deleteDisabled}
          />
        ))}
      </ul>
    </div>
  );
}
