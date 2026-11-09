import { forwardRef, useEffect, useRef } from "react";
import { AlertTriangle, CalendarCheck, Search } from "lucide-react";
import { hasReplied, type Conversation } from "@/lib/channels";
import { cn } from "@/lib/utils";
import {
  avatarColor,
  CHAT_FILTERS,
  displayName,
  initials,
  listTime,
  type ChatFilter,
  type ChatVariant,
} from "./utils";

export function InitialsAvatar({ name, size = 49 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColor(name),
        fontSize: size * 0.36,
      }}
    >
      {initials(name)}
    </span>
  );
}

export interface ConversationListProps {
  variant: ChatVariant;
  title: string;
  items: Conversation[];
  total: number;
  activePhone?: string;
  onSelect: (phone: string) => void;
  search: string;
  onSearch: (q: string) => void;
  filter: ChatFilter;
  onFilter: (f: ChatFilter) => void;
  isLoading?: boolean;
  error?: unknown;
}

export const ConversationList = forwardRef<HTMLInputElement, ConversationListProps>(
  function ConversationList(
    {
      variant,
      title,
      items,
      total,
      activePhone,
      onSelect,
      search,
      onSearch,
      filter,
      onFilter,
      isLoading,
      error,
    },
    searchRef,
  ) {
    const activeRowRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
      activeRowRef.current?.scrollIntoView({ block: "nearest" });
    }, [activePhone]);

    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--ch-panel,#fff)]">
        <div
          className={cn(
            "flex h-[59px] shrink-0 items-center justify-between px-4",
            variant === "whatsapp" && "bg-[var(--ch-header,#f0f2f5)]",
            variant === "viber" && "border-b border-[var(--ch-divider,#ececf5)]",
          )}
        >
          <h2
            className={cn(
              "text-[var(--ch-text,#111b21)]",
              variant === "sms" ? "text-[22px] font-normal" : "text-lg font-bold",
            )}
          >
            {title}
          </h2>
          <span className="text-xs text-[var(--ch-text-2,#667781)]">
            {items.length === total ? total : `${items.length} / ${total}`}
          </span>
        </div>

        <div className="shrink-0 px-3 pb-2 pt-2">
          <label
            className={cn(
              "flex items-center gap-3 px-3",
              variant === "sms"
                ? "h-11 rounded-full bg-[var(--ch-in,#e9eef6)]"
                : "h-9 rounded-lg bg-[var(--ch-header,#f0f2f5)]",
            )}
          >
            <Search className="size-4 shrink-0 text-[var(--ch-text-2,#54656f)]" aria-hidden />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search name, company or number"
              aria-label="Search conversations (press / to focus)"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ch-text,#111b21)] outline-none placeholder:text-[var(--ch-text-2,#667781)]"
            />
            <kbd className="hidden rounded border border-[var(--ch-divider,#e9edef)] px-1 text-[10px] text-[var(--ch-text-2,#667781)] md:inline">
              /
            </kbd>
          </label>
        </div>

        <div
          className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2"
          role="tablist"
          aria-label="Filter conversations"
        >
          {CHAT_FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={on}
                onClick={() => onFilter(f.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[13px] transition-colors",
                  on
                    ? "bg-[color-mix(in_srgb,var(--ch-primary,#00a884)_18%,transparent)] font-medium text-[var(--ch-primary,#008069)]"
                    : "bg-[var(--ch-header,#f0f2f5)] text-[var(--ch-text-2,#54656f)] hover:brightness-95",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          role="listbox"
          aria-label={`${title} conversations`}
        >
          {isLoading && (
            <div className="space-y-1 p-3" aria-busy>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 py-2">
                  <div className="size-12 rounded-full bg-[var(--ch-divider,#e9edef)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/2 rounded bg-[var(--ch-divider,#e9edef)]" />
                    <div className="h-3 w-3/4 rounded bg-[var(--ch-divider,#e9edef)]" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!!error && !isLoading && (
            <p className="p-4 text-sm text-red-600">Failed to load conversations. Retrying…</p>
          )}
          {!isLoading && !error && items.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--ch-text-2,#667781)]">
              {total === 0 ? "No conversations yet." : "No conversations match."}
            </p>
          )}
          {items.map((c) => {
            const name = displayName(c);
            const sel = c.phone === activePhone;
            const replied = hasReplied(c);
            const sub =
              c.leadName && c.companyName ? c.companyName : c.phone !== name ? c.phone : "";
            return (
              <button
                key={c.phone}
                ref={sel ? activeRowRef : undefined}
                role="option"
                aria-selected={sel}
                onClick={() => onSelect(c.phone)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 text-left transition-colors",
                  sel
                    ? "bg-[var(--ch-header,#f0f2f5)]"
                    : "hover:bg-[color-mix(in_srgb,var(--ch-header,#f0f2f5)_60%,transparent)]",
                  variant === "sms" && "rounded-r-full",
                )}
              >
                <InitialsAvatar name={name} size={variant === "sms" ? 40 : 49} />
                <div className="min-w-0 flex-1 border-b border-[var(--ch-divider,#e9edef)] py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 truncate text-[16px] text-[var(--ch-text,#111b21)]">
                      {name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        replied
                          ? "text-[var(--ch-primary,#00a884)]"
                          : "text-[var(--ch-text-2,#667781)]",
                      )}
                    >
                      {listTime(c.lastMessageAt)}
                    </span>
                  </div>
                  {sub && (
                    <div className="truncate text-[12px] text-[var(--ch-text-2,#667781)]">
                      {sub}
                    </div>
                  )}
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="flex-1 truncate text-sm text-[var(--ch-text-2,#667781)]">
                      {c.lastMessagePreview || c.messages.at(-1)?.content || c.phone}
                    </span>
                    {c.humanEscalated && (
                      <AlertTriangle
                        className="size-3.5 shrink-0 text-red-500"
                        aria-label="Escalated"
                      />
                    )}
                    {c.meetingScheduled && (
                      <CalendarCheck
                        className="size-3.5 shrink-0 text-[var(--ch-primary,#00a884)]"
                        aria-label="Meeting booked"
                      />
                    )}
                    {replied && (
                      <span
                        className="shrink-0 rounded-full bg-[var(--ch-primary,#25d366)] px-1.5 py-px text-[10px] font-semibold text-white"
                        title="Lead replied"
                      >
                        Replied
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
