import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Forward, RefreshCw, Reply, ReplyAll, Star, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";
import { RichEditor, type RichEditorHandle } from "./RichEditor";
import { SendButton } from "./SendButton";
import {
  avatarColor,
  displayName,
  escapeHtml,
  formatFullDate,
  formatListDate,
  parseSender,
  sanitizeEmailHtml,
  type GmailMessage,
  type GmailThreadSummary,
} from "./types";

const IFRAME_BASE_CSS = `<base target="_blank"><style>html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1F1F1F;overflow:hidden;word-wrap:break-word}img{max-width:100%;height:auto}pre{white-space:pre-wrap}a{color:#0B57D0}</style>`;

/**
 * Email HTML in a sandboxed iframe. No allow-scripts → nothing in the email can run;
 * allow-same-origin only lets the parent measure its height for auto-sizing.
 */
function EmailBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(80);

  const measure = () => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    setHeight(Math.max(40, doc.documentElement.scrollHeight, doc.body.scrollHeight) + 4);
  };

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    let ro: ResizeObserver | undefined;
    const onLoad = () => {
      measure();
      const doc = iframe.contentDocument;
      if (doc?.body && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(measure);
        ro.observe(doc.body);
      }
      doc?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="Email body"
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8">${IFRAME_BASE_CSS}</head><body>${sanitizeEmailHtml(html)}</body></html>`}
      className="w-full border-0 bg-white rounded"
      style={{ height }}
    />
  );
}

function Avatar({ name, outbound }: { name: string; outbound: boolean }) {
  if (outbound) {
    return (
      <div
        className="h-10 w-10 shrink-0 rounded-full grid place-items-center bg-[#86000B] text-white"
        aria-hidden
      >
        <Bot className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div
      className="h-10 w-10 shrink-0 rounded-full grid place-items-center text-white font-medium"
      style={{ background: avatarColor(name) }}
      aria-hidden
    >
      {(name[0] ?? "?").toUpperCase()}
    </div>
  );
}

function MessageCard({
  message,
  expanded,
  onToggle,
  onReply,
}: {
  message: GmailMessage;
  expanded: boolean;
  onToggle: () => void;
  onReply: (mode: ComposerMode) => void;
}) {
  const outbound = message.direction === "outbound";
  const sender = parseSender(message.from);
  const name = outbound ? "Martin Reyes" : sender.name || sender.email;

  return (
    <article
      className={cn(
        "border-b border-gray-200 dark:border-white/10",
        !expanded && "hover:bg-black/[.02]",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className="flex items-start gap-3 py-3 cursor-pointer"
      >
        <Avatar name={name} outbound={outbound} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[var(--ch-text)]">{name}</span>
            {outbound ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#D3E3FD] text-[#041E49] text-[11px] font-medium px-2 py-0.5">
                <Bot className="h-3 w-3" /> Martin (AI)
              </span>
            ) : (
              <span className="text-xs text-[var(--ch-text-2)] truncate">
                &lt;{sender.email}&gt;
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--ch-text-2)] truncate">
            {expanded ? `to ${displayName(message.to) || message.to}` : message.snippet}
          </div>
        </div>
        <span
          className="text-xs text-[var(--ch-text-2)] shrink-0"
          title={formatFullDate(message.date)}
        >
          {expanded ? formatFullDate(message.date) : formatListDate(message.date)}
        </span>
        {expanded && (
          <button
            type="button"
            aria-label="Reply"
            title="Reply"
            onClick={(e) => {
              e.stopPropagation();
              onReply("reply");
            }}
            className="h-8 w-8 -mt-1 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)]"
          >
            <Reply className="h-4 w-4" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="pl-0 md:pl-[52px] pb-4">
          <EmailBody html={message.htmlBody || `<p>${escapeHtml(message.snippet)}</p>`} />
        </div>
      )}
    </article>
  );
}

type ComposerMode = "reply" | "replyAll" | "forward";

function splitAddrs(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function InlineComposer({
  mode,
  thread,
  messages,
  onClose,
  onSent,
}: {
  mode: ComposerMode;
  thread: GmailThreadSummary;
  messages: GmailMessage[];
  onClose: () => void;
  onSent: () => void;
}) {
  const last = messages[messages.length - 1];
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const replyTarget = lastInbound
    ? parseSender(lastInbound.replyTo || lastInbound.from).email
    : (splitAddrs(last?.to ?? "")[0] ?? "");

  const defaultTo = mode === "forward" ? "" : replyTarget;
  const defaultCc =
    mode === "replyAll"
      ? Array.from(
          new Set(
            [
              ...splitAddrs((lastInbound ?? last)?.to ?? ""),
              ...splitAddrs((lastInbound ?? last)?.cc ?? ""),
            ]
              .map((a) => parseSender(a).email)
              .filter(
                (e) =>
                  e &&
                  e.toLowerCase() !== replyTarget.toLowerCase() &&
                  !e.toLowerCase().includes("martin@rareglobalfood.com"),
              ),
          ),
        ).join(", ")
      : "";

  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState(defaultCc);
  const editor = useRef<RichEditorHandle>(null);

  const quoted = last
    ? `<br><div class="gmail_quote">On ${escapeHtml(formatFullDate(last.date))}, ${escapeHtml(last.from)} wrote:<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${sanitizeEmailHtml(last.htmlBody || escapeHtml(last.snippet))}</blockquote></div>`
    : "";
  const forwardedHeader = last
    ? `<br><div>---------- Forwarded message ---------<br>From: ${escapeHtml(last.from)}<br>Date: ${escapeHtml(formatFullDate(last.date))}<br>Subject: ${escapeHtml(thread.subject)}<br>To: ${escapeHtml(last.to)}<br><br>${sanitizeEmailHtml(last.htmlBody || escapeHtml(last.snippet))}</div>`
    : "";
  const [showQuote, setShowQuote] = useState(false);

  const subjectBase = thread.subject.replace(/^(re|fwd?):\s*/i, "");
  const subject = mode === "forward" ? `Fwd: ${subjectBase}` : `Re: ${subjectBase}`;
  const Icon = mode === "forward" ? Forward : mode === "replyAll" ? ReplyAll : Reply;
  const invalidReason = /\S+@\S+\.\S+/.test(to) ? undefined : "Add a recipient";

  return (
    <div className="mt-4 rounded-2xl shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)] bg-[var(--ch-panel)] p-4">
      <div className="flex items-center gap-2 text-sm border-b border-gray-200 dark:border-white/10 pb-2">
        <Icon className="h-4 w-4 text-[var(--ch-text-2)]" />
        <input
          aria-label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipients"
          className="flex-1 bg-transparent outline-none text-[var(--ch-text)]"
          autoFocus={mode === "forward"}
        />
        <button
          type="button"
          aria-label="Discard reply"
          onClick={onClose}
          className="h-7 w-7 grid place-items-center rounded-full hover:bg-black/5"
        >
          <X className="h-4 w-4 text-[var(--ch-text-2)]" />
        </button>
      </div>
      {(mode === "replyAll" || cc) && (
        <div className="flex items-center gap-2 text-sm border-b border-gray-200 dark:border-white/10 py-2">
          <span className="text-[var(--ch-text-2)] w-6">Cc</span>
          <input
            aria-label="Cc"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[var(--ch-text)]"
          />
        </div>
      )}
      <RichEditor ref={editor} minHeight={120} autoFocus={mode !== "forward"} />
      {mode !== "forward" && last && (
        <button
          type="button"
          onClick={() => setShowQuote((v) => !v)}
          title={showQuote ? "Hide trimmed content" : "Show trimmed content"}
          className="mb-2 px-2 rounded bg-gray-100 dark:bg-white/10 text-[var(--ch-text-2)] text-xs leading-4"
        >
          •••
        </button>
      )}
      {(showQuote || mode === "forward") && last && (
        <div className="mb-2 max-h-56 overflow-y-auto border-l-2 border-gray-200 pl-3">
          <EmailBody html={mode === "forward" ? forwardedHeader : quoted} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <SendButton
          invalidReason={invalidReason}
          build={() => ({
            to: to.trim(),
            cc: cc.trim() || undefined,
            subject,
            html:
              (editor.current?.getHtml() || "") + (mode === "forward" ? forwardedHeader : quoted),
            threadId: mode === "forward" ? undefined : thread.threadId,
            inReplyTo: mode === "forward" ? undefined : (lastInbound ?? last)?.messageId,
          })}
          onSent={onSent}
        />
      </div>
    </div>
  );
}

export function ThreadView({
  thread,
  onBack,
  onToggleStar,
  onDelete,
  deleteDisabled,
  onSent,
}: {
  thread: GmailThreadSummary;
  onBack: () => void;
  onToggleStar: (t: GmailThreadSummary) => void;
  onDelete: () => void;
  deleteDisabled: boolean;
  onSent: () => void;
}) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["gmail-thread", thread.threadId],
    queryFn: async () => {
      const r = await fetch(`/api/gmail-thread?id=${encodeURIComponent(thread.threadId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to load thread from Gmail");
      return (j.messages ?? []) as GmailMessage[];
    },
    staleTime: 30_000,
  });
  const messages = data ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Gmail behaviour: only the latest message is open by default.
  useEffect(() => {
    if (messages.length) setExpanded(new Set([messages[messages.length - 1].id]));
    setComposer(null);
  }, [thread.threadId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (composer) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [composer]);

  const labels = [
    thread.direction === "inbound" ? "Lead replied" : "Sent",
    thread.messageCount === 1 && thread.direction === "outbound" ? "Campaign opener" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="h-full flex flex-col bg-[var(--ch-panel)] md:rounded-2xl">
      <div className="flex items-center gap-1 h-12 px-2 md:px-4 border-b border-gray-200 dark:border-white/10 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to list"
          title="Back to list"
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteDisabled}
          aria-label="Delete conversation"
          title="Move conversation to Trash"
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)] disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh thread"
          title="Refresh thread"
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-black/5 text-[var(--ch-text-2)]"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-10">
        <div className="flex items-start gap-3 pt-5 pb-3 md:pl-[52px]">
          <h2 className="flex-1 text-[22px] leading-7 text-[var(--ch-text)]">
            {thread.subject || "(no subject)"}
            {labels.map((l) => (
              <span
                key={l}
                className="ml-2 align-middle inline-block rounded bg-gray-200 dark:bg-white/10 text-[var(--ch-text-2)] text-xs px-1.5 py-0.5"
              >
                {l}
              </span>
            ))}
          </h2>
          <button
            type="button"
            aria-label={thread.isFlagged ? "Unstar" : "Star"}
            aria-pressed={thread.isFlagged}
            onClick={() => onToggleStar(thread)}
            className="h-9 w-9 grid place-items-center rounded-full hover:bg-black/5"
          >
            <Star
              className="h-5 w-5"
              style={{ color: thread.isFlagged ? "var(--ch-star)" : "var(--ch-text-2)" }}
              fill={thread.isFlagged ? "var(--ch-star)" : "none"}
            />
          </button>
        </div>

        {isLoading && (
          <div className="space-y-3 py-4" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        )}
        {error && !isLoading && (
          <EmptyState title="Couldn't load this thread" description={(error as Error).message} />
        )}
        {!isLoading && !error && messages.length === 0 && (
          <EmptyState title="No messages found in this Gmail thread" />
        )}

        {messages.map((m) => (
          <MessageCard
            key={m.id}
            message={m}
            expanded={expanded.has(m.id)}
            onToggle={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(m.id)) next.delete(m.id);
                else next.add(m.id);
                return next;
              })
            }
            onReply={setComposer}
          />
        ))}

        {messages.length > 0 && (
          <div className="md:pl-[52px]">
            {composer ? (
              <InlineComposer
                key={composer}
                mode={composer}
                thread={thread}
                messages={messages}
                onClose={() => setComposer(null)}
                onSent={() => {
                  setComposer(null);
                  refetch();
                  onSent();
                }}
              />
            ) : (
              <div className="flex flex-wrap gap-2 pt-5">
                {(
                  [
                    { mode: "reply", label: "Reply", icon: Reply },
                    { mode: "replyAll", label: "Reply all", icon: ReplyAll },
                    { mode: "forward", label: "Forward", icon: Forward },
                  ] as const
                ).map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setComposer(mode)}
                    className="inline-flex items-center gap-2 h-9 px-5 rounded-full border border-gray-300 dark:border-white/20 text-sm font-medium text-[var(--ch-text-2)] hover:bg-black/5"
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
