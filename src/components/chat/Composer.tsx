import { useState, type ReactNode } from "react";
import { SendHorizontal } from "lucide-react";
import { DisabledReason } from "@/components/shared";
import { useMe } from "@/hooks/use-me";
import { postAction } from "@/lib/action-client";
import { cn } from "@/lib/utils";
import type { ChatVariant } from "./utils";

type MeLike = { flags?: { manualReply?: boolean } } | undefined;

/** Reads flags whether useMe returns the payload directly or a query result. */
function useManualReplyFlag() {
  const me = useMe() as unknown as MeLike & { data?: MeLike };
  return !!(me?.flags?.manualReply ?? me?.data?.flags?.manualReply);
}

export function Composer({
  channel,
  phone,
  variant,
  footnote,
}: {
  channel: ChatVariant;
  phone: string;
  variant: ChatVariant;
  footnote?: ReactNode;
}) {
  const enabled = useManualReplyFlag();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const canSend = enabled && !sending && text.trim().length > 0;

  async function send() {
    if (!canSend) return;
    setSending(true);
    const r = await postAction(
      "/api/actions/reply",
      { channel, phone, text: text.trim() },
      "Reply sent",
    );
    setSending(false);
    if (r.ok) setText("");
  }

  const placeholder =
    variant === "sms" ? "Text message" : variant === "viber" ? "Type a message…" : "Type a message";

  return (
    <div
      className={cn(
        "shrink-0 px-3 py-2",
        variant === "whatsapp" && "bg-[var(--ch-header,#f0f2f5)]",
        variant !== "whatsapp" &&
          "border-t border-[var(--ch-divider,#e9edef)] bg-[var(--ch-panel,#fff)]",
      )}
    >
      <DisabledReason disabled={!enabled} reason="Backend not connected yet">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={!enabled || sending}
            rows={1}
            aria-label="Reply message"
            placeholder={enabled ? placeholder : "Manual replies are not enabled"}
            className={cn(
              "max-h-32 min-h-[42px] flex-1 resize-none bg-[var(--ch-panel,#fff)] px-4 py-2.5 text-[15px] text-[var(--ch-text,#111b21)] outline-none placeholder:text-[var(--ch-text-2,#667781)] disabled:cursor-not-allowed disabled:opacity-60",
              variant === "whatsapp"
                ? "rounded-lg"
                : "rounded-3xl border border-[var(--ch-divider,#e9edef)] bg-[var(--ch-in,#f1f3f4)]",
            )}
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[var(--ch-primary,#00a884)] text-white transition-opacity disabled:opacity-40"
          >
            <SendHorizontal className="size-5" />
          </button>
        </form>
      </DisabledReason>
      {footnote && (
        <p className="mt-1 text-center text-[11px] text-[var(--ch-text-2,#667781)]">{footnote}</p>
      )}
    </div>
  );
}
