import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_app/website")({
  component: WebsiteTab,
});

interface WebsiteChatMessage {
  sender: "visitor" | "agent";
  text: string;
  timestamp: string;
  attachmentUrl?: string | null;
  attachmentType?: "price_list_pdf" | "catalog_pdf" | null;
}

interface WebsiteChatSession {
  sessionId: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  businessType: string;
  businessSegment: string;
  visitorCity: string;
  visitorRegion: string;
  visitorCountry: string;
  pageUrl: string;
  status: "ai" | "escalated";
  conversationStage: string;
  firstSeenAt: string;
  lastMessageAt: string;
  messageCount: number;
  messages: WebsiteChatMessage[];
}

function formatShortDateTime(ts: string): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function sessionLabel(s: WebsiteChatSession): string {
  return `Visitor · ${s.sessionId.slice(-8)}`;
}

function statusBadge(status: WebsiteChatSession["status"]) {
  if (status === "escalated") return { label: "Needs Human", bg: "#86000B" };
  return { label: "AI Handling", bg: "#33673B" };
}

function useWebsiteChatSessions() {
  return useQuery({
    queryKey: ["website-chat-sessions"],
    queryFn: async () => {
      const r = await fetch("/api/website-chat-sessions");
      if (!r.ok) throw new Error("website-chat-sessions");
      const json = await r.json();
      return (json.sessions ?? []) as WebsiteChatSession[];
    },
    refetchInterval: 60000,
  });
}

function WebsiteTab() {
  const { data, isLoading, error } = useWebsiteChatSessions();
  const [search, setSearch] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const sessions = useMemo(() => {
    const sorted = [...(data ?? [])].sort((a, b) =>
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")
    );
    const q = search.toLowerCase().trim();
    if (!q) return sorted;
    return sorted.filter((s) =>
      [s.visitorName, s.visitorEmail, s.businessType, s.sessionId]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [data, search]);

  const active =
    sessions.find((s) => s.sessionId === activeSessionId) ?? sessions[0];

  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]"
      style={{ height: "calc(100vh - 7rem - 1rem)" }}
    >
      {/* ── Left panel — session list ───────────────────────────────────── */}
      <div
        className="border-r flex flex-col min-h-0"
        style={{ backgroundColor: "#FFEBCE" }}
      >
        <div className="px-4 py-3 border-b shrink-0">
          <div className="font-black text-lg" style={{ color: "#86000B" }}>
            Website
          </div>
        </div>
        <div className="p-3 border-b shrink-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, business or session…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="p-4 text-sm text-gray-500">Loading…</div>
          )}
          {error && (
            <div className="p-4 text-sm text-red-600">
              Failed to load website chat sessions.
            </div>
          )}
          {!isLoading && sessions.length === 0 && (
            <div className="p-4 text-sm text-gray-500">
              No conversations yet.
            </div>
          )}
          {sessions.map((s) => {
            const sel = active?.sessionId === s.sessionId;
            const badge = statusBadge(s.status);
            const primary = s.visitorName || sessionLabel(s);
            const secondary =
              s.businessType ||
              (s.visitorCity && s.visitorCountry
                ? `${s.visitorCity}, ${s.visitorCountry}`
                : s.pageUrl);
            return (
              <button
                key={s.sessionId}
                onClick={() => setActiveSessionId(s.sessionId)}
                className="w-full text-left px-4 py-3 border-b hover:bg-white transition-colors"
                style={{
                  backgroundColor: sel ? "#FFFFFF" : "transparent",
                  borderLeft: sel
                    ? "3px solid #86000B"
                    : "3px solid transparent",
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="font-bold text-sm truncate flex-1"
                    style={{ color: "#1B2419" }}
                  >
                    {primary}
                  </div>
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white tracking-wide"
                    style={{ backgroundColor: badge.bg }}
                  >
                    {badge.label}
                  </span>
                </div>
                {secondary && (
                  <div className="text-[11px] text-gray-500 truncate mt-0.5">
                    {secondary}
                  </div>
                )}
                <div className="flex items-center justify-between mt-1">
                  <div className="text-[10px] text-gray-400">
                    First seen {formatShortDateTime(s.firstSeenAt)}
                  </div>
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ backgroundColor: "#eee", color: "#666" }}
                  >
                    {s.messageCount} msgs
                  </span>
                </div>
                {s.lastMessageAt && (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Last message {formatShortDateTime(s.lastMessageAt)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right panel — chat view ─────────────────────────────────────── */}
      <div
        className="flex flex-col min-h-0"
        style={{ backgroundColor: "#FFF8F0" }}
      >
        {!active ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Select a conversation to view
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div
              className="px-5 py-3 flex items-center gap-3 shrink-0"
              style={{ backgroundColor: "#86000B" }}
            >
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(active.visitorName || sessionLabel(active))
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-white font-bold leading-tight truncate">
                  {active.visitorName || sessionLabel(active)}
                </div>
                <div className="text-white/70 text-xs truncate">
                  {[active.businessType, [active.visitorCity, active.visitorRegion, active.visitorCountry].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <span
                className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: statusBadge(active.status).bg }}
              >
                {statusBadge(active.status).label}
              </span>
            </div>

            {/* Message bubbles */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
              {active.messages.length === 0 && (
                <div className="text-center text-sm text-gray-400 mt-8">
                  No messages yet.
                </div>
              )}
              {active.messages.map((m, i) => {
                const out = m.sender === "agent";
                return (
                  <div
                    key={i}
                    className={`flex ${out ? "justify-end" : "justify-start"}`}
                  >
                    <div className="max-w-[70%]">
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                          out
                            ? "rounded-br-sm text-white"
                            : "rounded-bl-sm bg-white"
                        }`}
                        style={
                          out
                            ? { backgroundColor: "#86000B" }
                            : { color: "#1B2419" }
                        }
                      >
                        <span style={{ whiteSpace: "pre-wrap" }}>
                          {m.text}
                        </span>
                      </div>
                      {m.attachmentUrl && (
                        <a
                          href={m.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 flex items-center gap-3 rounded-lg p-3 transition-opacity hover:opacity-90"
                          style={{
                            backgroundColor: out
                              ? "rgba(255,255,255,0.15)"
                              : "#F7F4EF",
                            border: out
                              ? "1px solid rgba(255,255,255,0.3)"
                              : "1px solid #e0d6c8",
                          }}
                        >
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                            style={{ backgroundColor: "#86000B" }}
                          >
                            <FileText className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className="truncate text-sm font-medium"
                              style={{ color: out ? "#fff" : "#1B2419" }}
                            >
                              {m.attachmentType === "price_list_pdf"
                                ? "Price List.pdf"
                                : "Product Catalog.pdf"}
                            </div>
                            <div
                              className="text-xs"
                              style={{
                                color: out ? "rgba(255,255,255,0.7)" : "#666",
                              }}
                            >
                              Tap to view
                            </div>
                          </div>
                        </a>
                      )}
                      <div
                        className={`text-[10px] text-gray-500 mt-0.5 ${
                          out ? "text-right" : "text-left"
                        }`}
                      >
                        {formatShortDateTime(m.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
