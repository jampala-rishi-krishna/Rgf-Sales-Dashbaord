import { CheckCheck, UserRound } from "lucide-react";
import type { ChatMessage } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { timeOnly, type ChatVariant } from "./utils";

export interface ChatBubbleProps {
  message: ChatMessage;
  variant: ChatVariant;
  /** First bubble of a consecutive same-sender group (gets the tail / sender label). */
  firstInGroup?: boolean;
  /** Last bubble of a group (SMS/Viber show the timestamp under it). */
  lastInGroup?: boolean;
  /** Outgoing message has been followed by a customer reply (blue ticks). */
  read?: boolean;
}

function Tail({ out }: { out: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 13"
      width="8"
      height="13"
      className={cn("absolute top-0", out ? "-right-2" : "-left-2 -scale-x-100")}
    >
      <path d="M0 0h8L0 13z" fill={out ? "var(--ch-out, #d9fdd3)" : "var(--ch-in, #fff)"} />
    </svg>
  );
}

function SenderTag({ message }: { message: ChatMessage }) {
  if (message.role === "martin") {
    return (
      <span
        className="mr-1 inline-flex items-center rounded bg-black/10 px-1 text-[9px] font-bold uppercase tracking-wide align-middle opacity-70"
        title={`${message.agentName ?? "Martin"} (AI agent)`}
      >
        AI
      </span>
    );
  }
  if (message.role === "human") {
    return (
      <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-[var(--ch-primary,#00a884)]">
        <span className="grid size-4 place-items-center rounded-full bg-[var(--ch-primary,#00a884)] text-white">
          <UserRound className="size-3" aria-hidden />
        </span>
        {message.agentName ? `${message.agentName} · Sales rep` : "Sales rep"}
      </span>
    );
  }
  return null;
}

export function ChatBubble({
  message,
  variant,
  firstInGroup = true,
  lastInGroup = true,
  read = false,
}: ChatBubbleProps) {
  const out = message.role !== "customer";
  const time = timeOnly(message.ts);

  if (variant === "whatsapp") {
    return (
      <div
        className={cn(
          "flex px-[6%]",
          out ? "justify-end" : "justify-start",
          firstInGroup ? "mt-3" : "mt-0.5",
        )}
      >
        <div
          className={cn(
            "relative max-w-[min(65%,560px)] rounded-lg px-2 pb-1.5 pt-1.5 text-[14.2px] leading-[19px] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]",
            out ? "bg-[var(--ch-out,#d9fdd3)]" : "bg-[var(--ch-in,#fff)]",
            "text-[var(--ch-text,#111b21)]",
            firstInGroup && (out ? "rounded-tr-none" : "rounded-tl-none"),
          )}
        >
          {firstInGroup && <Tail out={out} />}
          {firstInGroup && message.role === "human" && <SenderTag message={message} />}
          <span className="whitespace-pre-wrap break-words">
            {message.role === "martin" && firstInGroup && <SenderTag message={message} />}
            {message.content}
          </span>
          {/* spacer so the floated meta never overlaps text */}
          <span aria-hidden className="inline-block w-[70px]" />
          <span className="float-right -mb-1 ml-2 mt-1 flex translate-y-0.5 items-center gap-0.5 text-[11px] leading-none text-[var(--ch-text-2,#667781)]">
            {time}
            {out && (
              <CheckCheck
                className={cn("size-4", read ? "text-[var(--ch-tick-read,#53bdeb)]" : "")}
                aria-label={read ? "Read" : "Delivered"}
              />
            )}
          </span>
        </div>
      </div>
    );
  }

  if (variant === "viber") {
    return (
      <div
        className={cn(
          "flex flex-col px-4",
          out ? "items-end" : "items-start",
          firstInGroup ? "mt-3" : "mt-1",
        )}
      >
        <div
          className={cn(
            "max-w-[min(70%,520px)] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
            out
              ? "bg-[var(--ch-out,#e8e3ff)] text-[var(--ch-out-text,#1f1147)]"
              : "border border-[var(--ch-divider,#e5e5ef)] bg-[var(--ch-in,#fff)] text-[var(--ch-text,#1f1f2e)]",
          )}
        >
          {firstInGroup && message.role === "human" && <SenderTag message={message} />}
          <span className="whitespace-pre-wrap break-words">
            {message.role === "martin" && firstInGroup && <SenderTag message={message} />}
            {message.content}
          </span>
        </div>
        {lastInGroup && (
          <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-[var(--ch-text-2,#8e8ea0)]">
            {time}
            {out && (
              <CheckCheck
                className={cn("size-3.5", read && "text-[var(--ch-tick-read,#7360f2)]")}
                aria-label={read ? "Seen" : "Delivered"}
              />
            )}
          </span>
        )}
      </div>
    );
  }

  // SMS — Google Messages
  return (
    <div
      className={cn(
        "flex flex-col px-4",
        out ? "items-end" : "items-start",
        firstInGroup ? "mt-3" : "mt-0.5",
      )}
    >
      <div
        className={cn(
          "max-w-[min(75%,520px)] px-4 py-2.5 text-[15px] leading-snug",
          out
            ? "bg-[var(--ch-out,#d3e3fd)] text-[var(--ch-out-text,#041e49)]"
            : "bg-[var(--ch-in,#e9eef6)] text-[var(--ch-text,#1f1f1f)]",
          "rounded-[20px]",
          out && !firstInGroup && "rounded-tr-md",
          out && !lastInGroup && "rounded-br-md",
          !out && !firstInGroup && "rounded-tl-md",
          !out && !lastInGroup && "rounded-bl-md",
        )}
      >
        {firstInGroup && message.role === "human" && <SenderTag message={message} />}
        <span className="whitespace-pre-wrap break-words">
          {message.role === "martin" && firstInGroup && <SenderTag message={message} />}
          {message.content}
        </span>
      </div>
      {lastInGroup && (
        <span className="mt-1 px-2 text-[11px] text-[var(--ch-text-2,#5f6368)]">{time}</span>
      )}
    </div>
  );
}
