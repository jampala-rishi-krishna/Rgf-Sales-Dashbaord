import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchSheet, EMAIL_SHEET_ID, type EmailRow } from "@/lib/sheets";

export const Route = createFileRoute("/_app/email")({
  component: EmailTab,
});

interface ConversationMessage {
  role: "customer" | "martin";
  content: string;
  ts: string;
}

interface ConversationThread {
  found: boolean;
  email: string;
  companyName: string;
  leadName: string;
  channel: string;
  conversationStage: string;
  brochureSent: boolean;
  priceSent: boolean;
  formSent: boolean;
  meetingScheduled: boolean;
  humanEscalated: boolean;
  discountAttempts: number;
  lastUpdated: string;
  messages: ConversationMessage[];
}

interface GmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  direction: "inbound" | "outbound";
  htmlBody: string;
  snippet: string;
}

function formatTs(ts: string): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function EmailTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["emails"],
    queryFn: () => fetchSheet<EmailRow>(EMAIL_SHEET_ID, "Sent Log"),
    refetchInterval: 60000,
  });
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const rows = useMemo(() => {
    const sorted = [...(data ?? [])].sort((a, b) =>
      `${b.Date_Sent} ${b.Time_Sent}`.localeCompare(`${a.Date_Sent} ${a.Time_Sent}`)
    );
    const q = search.toLowerCase();
    if (!q) return sorted;
    return sorted.filter((r) =>
      [r.Company_Name, r.Email_Sent_To, r.Email_Subject, r.Contact_Name]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [data, search]);

  const selected = selectedIdx !== null ? rows[selectedIdx] : null;

  // ── Gmail thread ──────────────────────────────────────────────────────────
  const [thread, setThread] = useState<GmailMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setThread([]);
      setThreadError(null);
      return;
    }
    const to = selected.Email_Sent_To;
    if (!to) {
      setThread([]);
      setThreadError("No recipient email on record.");
      return;
    }
    setThreadLoading(true);
    setThread([]);
    setThreadError(null);

    fetch(`/api/gmail-thread?to=${encodeURIComponent(to)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setThread(data.messages);
        } else {
          setThreadError("No Gmail thread found for this address yet.");
        }
      })
      .catch(() => setThreadError("Failed to load thread from Gmail."))
      .finally(() => setThreadLoading(false));
  }, [selected]);

  // ── Conversation thread (25 s auto-refresh while a row is selected) ──────
  const [conversationThread, setConversationThread] = useState<ConversationThread | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setConversationThread(null);
      setConversationError(null);
      return;
    }
    const to = selected.Email_Sent_To;
    if (!to) {
      setConversationThread(null);
      setConversationError(null);
      return;
    }

    let cancelled = false;

    function doFetch() {
      setConversationLoading(true);
      fetch(`/api/email-conversation?to=${encodeURIComponent(to)}`)
        .then((r) => r.json())
        .then((json: ConversationThread) => {
          if (!cancelled) {
            setConversationThread(json);
            setConversationError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setConversationError("Failed to load conversation.");
        })
        .finally(() => {
          if (!cancelled) setConversationLoading(false);
        });
    }

    doFetch();
    const interval = setInterval(doFetch, 25000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selected, refreshTick]);

  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]"
      style={{ height: "calc(100vh - 7rem - 1rem)" }}
    >
      {/* ── Left panel — email list ─────────────────────────────────────── */}
      <div className="border-r flex flex-col overflow-hidden" style={{ backgroundColor: "#FFEBCE" }}>
        <div className="p-3 border-b">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading && <div className="p-4 text-sm text-gray-500">Loading…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No emails yet.</div>
          )}
          {rows.map((r, i) => {
            const sel = selectedIdx === i;
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-white"
                style={{
                  backgroundColor: sel ? "#FFFFFF" : "transparent",
                  borderLeft: sel ? "3px solid #86000B" : "3px solid transparent",
                }}
              >
                <div className="font-bold text-sm truncate" style={{ color: "#1B2419" }}>
                  {r.Company_Name || r.Email_Sent_To || "Unknown"}
                </div>
                <div className="text-xs text-gray-600 truncate mt-0.5">
                  {r.Email_Sent_To || "No recipient"}
                </div>
                <div className="text-[11px] truncate" style={{ color: "#86000B" }}>
                  {r.Email_Subject || "No subject"}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {r.Date_Sent} {r.Time_Sent?.slice(0, 5)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel — email detail + conversation ───────────────────── */}
      <div className="relative overflow-hidden">
        {/* Fade hint — only when a thread with messages exists (more content below) */}
        {selected && conversationThread?.found && (conversationThread.messages?.length ?? 0) > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none z-10"
            style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.92))" }}
          />
        )}
      <div className="overflow-y-auto bg-white absolute inset-0">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Select an email to view
          </div>
        ) : (
          <div className="p-6 max-w-3xl">
            {/* Header row with refresh button */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold leading-snug" style={{ color: "#1B2419" }}>
                {selected.Email_Subject || "No Subject"}
              </h2>
              <button
                onClick={() => setRefreshTick((t) => t + 1)}
                className="shrink-0 p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Refresh email &amp; conversation"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Metadata card */}
            <div
              className="rounded-lg p-4 mb-5 text-[13px] leading-relaxed"
              style={{ backgroundColor: "#f9f5ef", border: "1px solid #e0d6c8" }}
            >
              <div><span className="font-semibold">From:</span> rishi@rareglobalfood.com</div>
              <div><span className="font-semibold">To:</span> {selected.Email_Sent_To || "—"}</div>
              <div><span className="font-semibold">Company:</span> {selected.Company_Name || "—"}</div>
              <div><span className="font-semibold">Contact:</span> {selected.Contact_Name || "—"}</div>
              <div><span className="font-semibold">Date:</span> {selected.Date_Sent} {selected.Time_Sent}</div>
              <div><span className="font-semibold">Product:</span> {selected.Product_Offered || "—"}</div>
              <div>
                <span className="font-semibold">Status:</span>{" "}
                <span style={{ color: "#33673B", fontWeight: 600 }}>
                  {selected.Status || "Sent"}
                </span>
              </div>
            </div>

            {threadLoading && (
              <div className="py-8 text-center text-sm" style={{ color: "#86000B" }}>
                Loading conversation from Gmail…
              </div>
            )}
            {threadError && !threadLoading && (
              <div
                className="rounded-lg p-4 text-[13px]"
                style={{ backgroundColor: "#fff5f5", border: "1px solid #fcc", color: "#c00" }}
              >
                {threadError}
              </div>
            )}
            {!threadLoading && thread.length > 0 && (
              <div className="space-y-4">
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg p-4"
                    style={{
                      border: "1px solid #e0d6c8",
                      backgroundColor: m.direction === "outbound" ? "#ffffff" : "#f9f5ef",
                    }}
                  >
                    <div className="text-[11px] text-gray-500 mb-2 flex justify-between">
                      <span className="font-semibold" style={{ color: m.direction === "outbound" ? "#86000B" : "#1B2419" }}>
                        {m.direction === "outbound" ? "Martin Reyes (Rare Global Food)" : m.from}
                      </span>
                      <span>{new Date(m.date).toLocaleString()}</span>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: m.htmlBody }} />
                  </div>
                ))}
              </div>
            )}
            {selected.Gmail_Message_ID && (
              <div className="mb-5 text-[11px] text-gray-400">
                Gmail ID: {selected.Gmail_Message_ID}
              </div>
            )}

            {/* ── Divider ───────────────────────────────────────────────── */}
            <div className="border-t my-6" style={{ borderColor: "#e0d6c8" }} />

            {/* ── Conversation thread ───────────────────────────────────── */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm" style={{ color: "#1B2419" }}>
                  Conversation Thread
                </h3>
                {conversationLoading && conversationThread && (
                  <span className="text-[11px] text-gray-400 animate-pulse">Refreshing…</span>
                )}
              </div>

              {/* Status pills — only rendered once we have a found thread */}
              {conversationThread?.found && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {conversationThread.conversationStage && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: "#f0f0f0", color: "#555" }}
                    >
                      {conversationThread.conversationStage.replace(/_/g, " ")}
                    </span>
                  )}
                  {conversationThread.brochureSent && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: "#f3e5f5", color: "#6a1b9a" }}
                    >
                      Brochure Sent
                    </span>
                  )}
                  {conversationThread.priceSent && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: "#e8f5e9", color: "#2e7d32" }}
                    >
                      Price Sent
                    </span>
                  )}
                  {conversationThread.formSent && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: "#e3f2fd", color: "#1565c0" }}
                    >
                      Form Sent
                    </span>
                  )}
                  {conversationThread.meetingScheduled && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: "#e8f5e9", color: "#1b5e20" }}
                    >
                      Meeting Booked ✓
                    </span>
                  )}
                  {conversationThread.humanEscalated && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: "#ffebee", color: "#b71c1c" }}
                    >
                      Escalated to Human
                    </span>
                  )}
                  {conversationThread.discountAttempts > 0 && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: "#fff8e1", color: "#e65100" }}
                    >
                      {conversationThread.discountAttempts} Discount Attempt
                      {conversationThread.discountAttempts > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}

              {/* Initial load spinner (no data yet) */}
              {conversationLoading && !conversationThread && (
                <div className="py-4 text-[13px] text-gray-400">Loading conversation…</div>
              )}

              {/* Fetch error */}
              {!conversationLoading && conversationError && (
                <div
                  className="rounded-lg p-3 text-[13px]"
                  style={{ backgroundColor: "#fff5f5", border: "1px solid #fcc", color: "#c00" }}
                >
                  {conversationError}
                </div>
              )}

              {/* No reply yet — calm, not an error */}
              {!conversationLoading && conversationThread && !conversationThread.found && (
                <p className="text-sm italic text-gray-400">No reply yet from this lead.</p>
              )}

              {/* Message bubbles — visible even while a background refresh runs */}
              {conversationThread?.found && conversationThread.messages.length > 0 && (
                <div className="space-y-4">
                  {conversationThread.messages.map((msg, i) => {
                    const isMartin = msg.role === "martin";
                    return (
                      <div key={i} className={`flex ${isMartin ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[80%]">
                          <div
                            className={`text-[10px] text-gray-500 mb-0.5 ${isMartin ? "text-right mr-1" : "ml-1"}`}
                          >
                            {isMartin ? "Martin Reyes (AI)" : conversationThread.leadName || "Customer"}
                          </div>
                          <div
                            className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                            style={
                              isMartin
                                ? {
                                    backgroundColor: "#fdf2f2",
                                    border: "1px solid #f5c2c2",
                                    color: "#1B2419",
                                    borderBottomRightRadius: "4px",
                                  }
                                : {
                                    backgroundColor: "#FFEBCE",
                                    border: "1px solid #e0d6c8",
                                    color: "#1B2419",
                                    borderBottomLeftRadius: "4px",
                                  }
                            }
                          >
                            <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                          </div>
                          <div
                            className={`text-[10px] text-gray-400 mt-0.5 ${isMartin ? "text-right mr-1" : "ml-1"}`}
                          >
                            {formatTs(msg.ts)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Edge case: found=true but messages array is empty */}
              {!conversationLoading &&
                conversationThread?.found &&
                conversationThread.messages.length === 0 && (
                  <p className="text-sm italic text-gray-400">No messages in thread yet.</p>
                )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
