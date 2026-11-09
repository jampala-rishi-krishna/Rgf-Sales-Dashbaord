import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ExternalLink, FileText, Send } from "lucide-react";
import { AgentAvatar, DisabledReason, TypingDots } from "@/components/shared";
import { useMe } from "@/hooks/use-me";
import { postAction } from "@/lib/action-client";
import { formatManila } from "@/lib/channels";
import {
  attachmentName,
  parseText,
  type WebsiteChatMessage,
  type WebsiteChatSession,
} from "./types";

const RECENT_MS = 20_000;

export function FileCard({ url, name, onDark }: { url: string; name: string; onDark?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1.5 flex max-w-xs items-center gap-3 rounded-xl p-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86000B]/50 ${
        onDark
          ? "bg-white/15 ring-1 ring-white/25 hover:bg-white/20"
          : "bg-[#FFF8F0] ring-1 ring-[#e0d6c8] hover:bg-[#FFEBCE]"
      }`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#86000B] text-white">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-medium ${onDark ? "text-white" : "text-[#1B2419]"}`}
        >
          {name}
        </span>
        <span className={`block text-xs ${onDark ? "text-white/70" : "text-[#6b6b6b]"}`}>
          PDF · Open
        </span>
      </span>
    </a>
  );
}

function MessageBody({ m, out }: { m: WebsiteChatMessage; out: boolean }) {
  const parts = parseText(m.text ?? "");
  const files = parts.filter((p) => p.kind === "file");
  const inline = parts.filter((p) => p.kind !== "file");
  const hasText = inline.some((p) => (p.kind === "text" ? p.text.trim() : true));
  return (
    <>
      {hasText && (
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${out ? "rounded-br-md bg-[#86000B] text-white" : "rounded-bl-md bg-white text-[#1B2419] ring-1 ring-black/5"}`}
        >
          <span className="whitespace-pre-wrap break-words">
            {inline.map((p, i) =>
              p.kind === "text" ? (
                <span key={i}>{p.text}</span>
              ) : p.kind === "link" ? (
                <a
                  key={i}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-0.5 underline underline-offset-2 ${out ? "text-white" : "text-[#86000B]"}`}
                >
                  {p.url.replace(/^https?:\/\//, "").slice(0, 48)}
                  <ExternalLink className="size-3" />
                </a>
              ) : null,
            )}
          </span>
        </div>
      )}
      {files.map((f, i) => f.kind === "file" && <FileCard key={i} url={f.url} name={f.name} />)}
      {m.attachmentUrl && <FileCard url={m.attachmentUrl} name={attachmentName(m)} />}
    </>
  );
}

/** Hides a just-arrived agent message behind typing dots briefly, like a live widget. */
function useRevealRecent(messages: WebsiteChatMessage[]) {
  const reduce = useReducedMotion();
  const last = messages[messages.length - 1];
  const lastKey = last ? `${last.timestamp}|${last.text?.length}` : "";
  const isRecentAgent =
    !!last &&
    last.sender === "agent" &&
    Date.now() - new Date(last.timestamp).getTime() < RECENT_MS;
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  useEffect(() => {
    if (!isRecentAgent || reduce) return;
    setHiddenKey(lastKey);
    const t = setTimeout(() => setHiddenKey(null), 1200);
    return () => clearTimeout(t);
  }, [lastKey, isRecentAgent, reduce]);
  return hiddenKey === lastKey && isRecentAgent && !reduce;
}

export function ChatThread({ session }: { session: WebsiteChatSession }) {
  const messages = session.messages ?? [];
  const reduce = useReducedMotion();
  const hideLast = useRevealRecent(messages);
  const shown = hideLast ? messages.slice(0, -1) : messages;
  const last = messages[messages.length - 1];
  const visitorWaiting =
    !!last &&
    last.sender === "visitor" &&
    session.status === "ai" &&
    Date.now() - new Date(last.timestamp).getTime() < 90_000;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [session.sessionId, shown.length, hideLast, reduce]);

  let lastDay = "";
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6"
      style={{
        backgroundColor: "#FFF8F0",
        backgroundImage: "radial-gradient(rgba(134,0,11,0.06) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="mx-auto max-w-3xl space-y-2">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-[#6b6b6b]">No messages yet.</div>
        )}
        {shown.map((m, i) => {
          const out = m.sender === "agent";
          const day = formatManila(m.timestamp, {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = shown[i - 1];
          const firstOfGroup = !prev || prev.sender !== m.sender || showDay;
          return (
            <div key={i}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-white/80 px-3 py-0.5 text-[11px] font-medium text-[#6b6b6b] ring-1 ring-black/5">
                    {day}
                  </span>
                </div>
              )}
              <div
                className={`flex items-end gap-2 ${out ? "justify-end" : "justify-start"} ${firstOfGroup ? "mt-3" : ""}`}
              >
                <div className={`flex max-w-[78%] flex-col ${out ? "items-end" : "items-start"}`}>
                  {firstOfGroup && (
                    <div className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[#86000B]/80">
                      {out ? "Martin · AI" : "Visitor"}
                    </div>
                  )}
                  <MessageBody m={m} out={out} />
                  <div className="mt-0.5 px-1 text-[10px] text-[#8a8a8a]">
                    {formatManila(m.timestamp, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {(hideLast || visitorWaiting) && (
          <div
            className="mt-3 flex items-end gap-2"
            aria-live="polite"
            aria-label="Martin is typing"
          >
            <AgentAvatar agent="Martin" channel="web" size={24} />
            <div className="rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export function ReplyComposer({ sessionId }: { sessionId: string }) {
  const { data: me } = useMe();
  const enabled = !!me?.flags?.manualReply;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => setText(""), [sessionId]);

  async function send() {
    const t = text.trim();
    if (!t || !enabled || sending) return;
    setSending(true);
    const r = await postAction(
      "/api/actions/reply",
      { channel: "website", sessionId, text: t },
      "Reply sent to visitor",
    );
    setSending(false);
    if (r.ok) setText("");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex shrink-0 items-end gap-2 border-t border-[#e0d6c8] bg-white px-3 py-2.5 md:px-4"
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
        aria-label="Reply to visitor"
        placeholder={
          enabled ? "Reply as a rep… (Enter to send)" : "Manual replies are not available yet"
        }
        className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl bg-[#FFF8F0] px-3.5 py-2.5 text-sm text-[#1B2419] ring-1 ring-[#e0d6c8] placeholder:text-[#8a8a8a] focus:outline-none focus:ring-[#86000B]/50 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <DisabledReason disabled={!enabled} reason="Backend not connected yet">
        <button
          type="submit"
          disabled={!enabled || sending || !text.trim()}
          aria-label="Send reply"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[#86000B] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86000B]/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </DisabledReason>
    </form>
  );
}
