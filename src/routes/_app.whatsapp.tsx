import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsAppTab,
});

interface WhatsAppMessage {
  role: "customer" | "martin";
  content: string;
  ts: string;
}

interface WhatsAppConversation {
  phone: string;
  leadName: string;
  companyName: string;
  channel: string;
  conversationStage: string;
  brochureSent: boolean;
  priceSent: boolean;
  formSent: boolean;
  meetingScheduled: boolean;
  humanEscalated: boolean;
  discountAttempts: number;
  duplicateRowCount: number;
  lastUpdated: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  messages: WhatsAppMessage[];
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

function isTest(c: WhatsAppConversation) {
  return c.companyName?.startsWith("Test Dummy Company - ");
}

function useWhatsAppConversations() {
  return useQuery({
    queryKey: ["whatsapp-conversations"],
    queryFn: async () => {
      const r = await fetch("/api/whatsapp-conversations");
      if (!r.ok) throw new Error("WhatsApp fetch failed");
      const d = await r.json();
      return (d.conversations ?? []) as WhatsAppConversation[];
    },
    refetchInterval: 30000,
  });
}

function WhatsAppTab() {
  const { data, isLoading, error } = useWhatsAppConversations();
  const [search, setSearch] = useState("");
  const [activePhone, setActivePhone] = useState<string | null>(null);

  // n8n returns one object per lead, already de-duped and sorted newest-first.
  // Only apply the search filter — never re-sort.
  const conversations = useMemo(() => {
    const all = data ?? [];
    const q = search.toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      [c.phone, c.leadName, c.companyName].join(" ").toLowerCase().includes(q)
    );
  }, [data, search]);

  const active =
    conversations.find((c) => c.phone === activePhone) ?? conversations[0];

  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[35%_65%]"
      style={{ height: "calc(100vh - 7rem - 1rem)" }}
    >
      {/* ── Left panel — conversation list ─────────────────────────────── */}
      <div
        className="border-r flex flex-col min-h-0"
        style={{ backgroundColor: "#FFEBCE" }}
      >
        <div className="px-4 py-3 border-b shrink-0">
          <div className="font-black text-lg" style={{ color: "#86000B" }}>
            WhatsApp
          </div>
        </div>
        <div className="p-3 border-b shrink-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company or number…"
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white focus:outline-none"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="p-4 text-sm text-gray-500">Loading…</div>
          )}
          {error && (
            <div className="p-4 text-sm text-red-600">
              Failed to load conversations.
            </div>
          )}
          {!isLoading && conversations.length === 0 && (
            <div className="p-4 text-sm text-gray-500">
              No conversations yet.
            </div>
          )}
          {conversations.map((c) => {
            const sel = active?.phone === c.phone;
            const test = isTest(c);
            const displayName = c.leadName || c.companyName || c.phone;
            return (
              <button
                key={c.phone}
                onClick={() => setActivePhone(c.phone)}
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
                    {displayName}
                  </div>
                  {test && (
                    <span
                      className="shrink-0 px-1.5 rounded text-[9px] font-bold tracking-wide"
                      style={{ backgroundColor: "#e0e0e0", color: "#888" }}
                    >
                      TEST
                    </span>
                  )}
                  <div className="text-[10px] text-gray-400 shrink-0">
                    {formatTs(c.lastMessageAt)}
                  </div>
                </div>
                {c.leadName && c.companyName && (
                  <div className="text-[11px] text-gray-500 truncate mt-0.5">
                    {c.companyName}
                  </div>
                )}
                <div className="text-xs text-gray-500 truncate mt-0.5">
                  {c.lastMessagePreview || c.phone}
                </div>
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
            Select a conversation
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div
              className="px-5 py-3 flex items-center gap-3 shrink-0"
              style={{ backgroundColor: "#86000B" }}
            >
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(active.leadName || active.phone).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-white font-bold leading-tight truncate">
                  {active.leadName || active.companyName || active.phone}
                </div>
                {active.leadName && active.companyName && (
                  <div className="text-white/70 text-xs truncate">
                    {active.companyName}
                  </div>
                )}
                <div className="text-white/60 text-[10px] mt-0.5">
                  Last active {formatTs(active.lastMessageAt)}
                </div>
              </div>
            </div>

            {/* Status pills */}
            {(active.conversationStage ||
              active.brochureSent ||
              active.priceSent ||
              active.formSent ||
              active.meetingScheduled ||
              active.humanEscalated ||
              active.discountAttempts > 0) && (
              <div
                className="px-4 py-2.5 flex flex-wrap gap-1.5 border-b shrink-0"
                style={{ backgroundColor: "#FFF8F0" }}
              >
                {active.conversationStage && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: "#f0f0f0", color: "#555" }}
                  >
                    {active.conversationStage.replace(/_/g, " ")}
                  </span>
                )}
                {active.brochureSent && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: "#f3e5f5", color: "#6a1b9a" }}
                  >
                    Brochure Sent
                  </span>
                )}
                {active.priceSent && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: "#e8f5e9", color: "#2e7d32" }}
                  >
                    Price Sent
                  </span>
                )}
                {active.formSent && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: "#e3f2fd", color: "#1565c0" }}
                  >
                    Form Sent
                  </span>
                )}
                {active.meetingScheduled && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: "#e8f5e9", color: "#1b5e20" }}
                  >
                    Meeting Booked ✓
                  </span>
                )}
                {active.humanEscalated && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: "#ffebee", color: "#b71c1c" }}
                  >
                    Escalated to Human
                  </span>
                )}
                {active.discountAttempts > 0 && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: "#fff8e1", color: "#e65100" }}
                  >
                    {active.discountAttempts} Discount Attempt
                    {active.discountAttempts > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {/* Message bubbles */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
              {active.messages.length === 0 && (
                <div className="text-center text-sm text-gray-400 mt-8">
                  No messages yet.
                </div>
              )}
              {active.messages.map((m, i) => {
                const out = m.role === "martin";
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
                          {m.content}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] text-gray-500 mt-0.5 ${
                          out ? "text-right" : "text-left"
                        }`}
                      >
                        {formatTs(m.ts)}
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
