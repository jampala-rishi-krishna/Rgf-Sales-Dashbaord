import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ChatVariant } from "./utils";

/** Centered pill used for date separators and system events. */
export function SystemPill({
  children,
  variant,
  tone = "system",
}: {
  children: ReactNode;
  variant: ChatVariant;
  tone?: "date" | "system";
}) {
  return (
    <div className="my-3 flex justify-center px-4" role="note">
      <span
        className={cn(
          "inline-flex max-w-[90%] items-center gap-1.5 text-center text-[12px]",
          variant === "whatsapp" &&
            "rounded-lg bg-[var(--ch-panel,#fff)] px-3 py-1.5 text-[var(--ch-text-2,#54656f)] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]",
          variant === "whatsapp" && tone === "date" && "uppercase",
          variant === "viber" &&
            "rounded-full bg-[var(--ch-divider,#ececf5)] px-3 py-1 text-[var(--ch-text-2,#6b6b80)]",
          variant === "sms" && "px-3 py-1 font-medium text-[var(--ch-text-2,#5f6368)]",
          tone === "system" &&
            variant === "whatsapp" &&
            "bg-[#fff3c4] text-[#54656f] dark:bg-[#1d282f] dark:text-[#ffd279]",
        )}
      >
        {children}
      </span>
    </div>
  );
}

export function DateSeparator({ label, variant }: { label: string; variant: ChatVariant }) {
  return (
    <SystemPill variant={variant} tone="date">
      {label}
    </SystemPill>
  );
}
