import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SendHorizontal } from "lucide-react";
import { DisabledReason } from "@/components/shared";
import { useMe } from "@/hooks/use-me";
import { postAction } from "@/lib/action-client";
import type { Feed } from "@/hooks/use-feeds";
import type { ChatMessage, Conversation } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { ChatVariant } from "./utils";

type MeLike = { flags?: { manualReply?: boolean } } | undefined;

/** Reads flags whether useMe returns the payload directly or a query result. */
function useManualReplyFlag() {
  const me = useMe() as unknown as MeLike & { data?: MeLike };
  return !!(me?.flags?.manualReply ?? me?.data?.flags?.manualReply);
}

const FEED_KEY: Record<ChatVariant, string> = {
  whatsapp: "whatsapp-conversations",
  sms: "sms-conversations",
  viber: "viber-conversations",
};

// Unsent drafts survive switching threads (the composer remounts per conversation).
const drafts = new Map<string, string>();

type ReplyData = { message?: Partial<ChatMessage> };

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
  const qc = useQueryClient();
  const draftKey = `${channel}:${phone}`;
  const [text, setTextState] = useState(() => drafts.get(draftKey) ?? "");
  const [sending, setSending] = useState(false);
  const canSend = enabled && !sending && text.trim().length > 0;

  function setText(next: string | ((cur: string) => string)) {
    setTextState((cur) => {
      const v = typeof next === "function" ? next(cur) : next;
      if (v) drafts.set(draftKey, v);
      else drafts.delete(draftKey);
      return v;
    });
  }

  async function send() {
    if (!canSend) return;
    const sent = text.trim();
    setSending(true);
    const r = await postAction<ReplyData>(
      "/api/actions/reply",
      { channel, phone, text: sent },
      "Reply sent",
    );
    setSending(false);
    if (!r.ok) return;
    // Keep anything typed while the send was in flight.
    setText((cur) => (cur.trim() === sent ? "" : cur));
    if (r.dryRun) return;
    // Show the rep's message immediately instead of waiting for the next poll, then
    // reconcile with the server copy (which also picks up any reply Martin sent meanwhile).
    const m = r.data?.message;
    const msg: ChatMessage = {
      role: "human",
      content: m?.content ?? sent,
      ts: m?.ts ?? new Date().toISOString(),
      agentName: m?.agentName,
    };
    const key = [FEED_KEY[channel]];
    qc.setQueryData<Feed<Conversation>>(key, (feed) =>
      feed
        ? {
            ...feed,
            items: feed.items.map((c) =>
              c.phone === phone
                ? {
                    ...c,
                    messages: [...c.messages, msg],
                    lastMessageAt: msg.ts,
                    lastMessagePreview: msg.content,
                  }
                : c,
            ),
          }
        : feed,
    );
    void qc.invalidateQueries({ queryKey: key });
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
            disabled={!enabled}
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
